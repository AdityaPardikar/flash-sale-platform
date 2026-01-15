#!/bin/sh
# Pre-commit hook to lint and format staged files

echo "🔍 Running pre-commit checks..."

# Check if lint-staged is installed
if ! command -v lint-staged &> /dev/null; then
  echo "⚠️  lint-staged not installed, skipping linting"
  exit 0
fi

# Run lint-staged
lint-staged

if [ $? -ne 0 ]; then
  echo "❌ Pre-commit check failed"
  exit 1
fi

echo "✅ Pre-commit checks passed"
exit 0
