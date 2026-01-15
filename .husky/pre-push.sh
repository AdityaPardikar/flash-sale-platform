#!/bin/sh
# Pre-push hook to run tests before pushing

echo "🧪 Running tests before push..."

npm run test

if [ $? -ne 0 ]; then
  echo "❌ Tests failed, push aborted"
  exit 1
fi

echo "✅ All tests passed"
exit 0
