/**
 * GraphQL Server Setup
 * Week 5 Day 4: API Enhancement & GraphQL
 *
 * Simplified Apollo Server integration
 */

import { ApolloServer } from '@apollo/server';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { Express, Request, Response } from 'express';
import { typeDefs } from './schema';
import { resolvers, createDataLoaders } from './resolvers';
import { verifyToken } from '../utils/jwt';

// Context interface
interface Context {
  user: any | null;
  loaders: ReturnType<typeof createDataLoaders>;
}

// Build executable schema
export const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});

/**
 * Create Apollo Server
 */
export async function createApolloServer() {
  const server = new ApolloServer<Context>({
    schema,
    formatError: (error) => {
      console.error('GraphQL Error:', error);

      if (process.env.NODE_ENV === 'production') {
        if (error.extensions?.code === 'INTERNAL_SERVER_ERROR') {
          return {
            message: 'An internal error occurred',
            extensions: { code: 'INTERNAL_SERVER_ERROR' },
          };
        }
      }

      return error;
    },
  });

  return server;
}

/**
 * Apply GraphQL endpoint to Express app using standalone approach
 */
export async function applyGraphQLMiddleware(app: Express) {
  const server = await createApolloServer();
  await server.start();

  // Manual GraphQL endpoint using executeOperation pattern
  app.post('/graphql', async (req: Request, res: Response) => {
    // Get user from authorization header
    const token = req.headers.authorization;
    let user = null;

    if (token) {
      try {
        user = await verifyToken(token.replace('Bearer ', ''));
      } catch (e) {
        // Invalid token - user remains null
      }
    }

    const loaders = createDataLoaders();

    try {
      const result = await server.executeOperation(
        {
          query: req.body.query,
          variables: req.body.variables,
          operationName: req.body.operationName,
        },
        {
          contextValue: { user, loaders },
        }
      );

      // Handle single result
      if (result.body.kind === 'single') {
        res.json(result.body.singleResult);
      } else {
        res.status(400).json({ errors: [{ message: 'Streaming not supported' }] });
      }
    } catch (error: any) {
      console.error('GraphQL execution error:', error);
      res.status(500).json({
        errors: [{ message: error.message || 'Internal server error' }],
      });
    }
  });

  // GraphQL GET for introspection
  app.get('/graphql', async (req: Request, res: Response) => {
    res.json({
      message: 'GraphQL endpoint ready. Use POST for queries.',
      docs: '/graphql with { query, variables, operationName }',
    });
  });

  console.log('🚀 GraphQL server ready at /graphql');

  return server;
}

export default {
  createApolloServer,
  applyGraphQLMiddleware,
  schema,
};
