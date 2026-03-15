#!/bin/bash
# ci-watch.sh: Re-check GitHub Actions CI build until it completes and reports success.
# Usage: ./scripts/ci-watch.sh [branch]

BRANCH=${1:-$(git rev-parse --abbrev-ref HEAD)}

echo "👀 Watching recent CI run for branch: $BRANCH..."

while true; do
  # Fetch latest run ID and status using GitHub CLI for lint-and-test workflow
  OUTPUT=$(gh run list --branch "$BRANCH" --limit 1 --json status,conclusion --jq '.[0]')
  
  if [ -z "$OUTPUT" ] || [ "$OUTPUT" == "null" ]; then
    echo "⚠️  No workflows found for branch $BRANCH."
    exit 1
  fi
  
  STATUS=$(echo "$OUTPUT" | jq -r '.status')
  CONCLUSION=$(echo "$OUTPUT" | jq -r '.conclusion')
  
  if [ "$STATUS" == "completed" ] || [ "$STATUS" == "" ]; then
    if [ "$CONCLUSION" == "success" ]; then
      echo "✅ CI Build Succeeded for branch $BRANCH."
      exit 0
    else
      echo "❌ CI Build Failed (Conclusion: $CONCLUSION) for branch $BRANCH."
      echo "Please fix the failing tests or lint errors and push again."
      exit 1
    fi
  else
    echo "⏳ CI Build Status: $STATUS... retrying in 10s"
    sleep 10
  fi
done
