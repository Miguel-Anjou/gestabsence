#!/bin/bash
SUPA_URL="https://scqwvjvhmqifbhchlnqv.supabase.co"
SUPA_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcXd2anZobXFpZmJoY2hsbnF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2MTM1MjYsImV4cCI6MjA5MzE4OTUyNn0.nFKkCaufwDlDgI1AMPKB0axQTDbTTUTNUH0HRtyilWo"
mkdir -p build/static/js
node_modules/.bin/esbuild src/index.js \
  --bundle --minify \
  --jsx=automatic \
  --loader:.js=jsx --loader:.jsx=jsx \
  --define:process.env.NODE_ENV='"production"' \
  --define:process.env.REACT_APP_SUPABASE_URL="\"$SUPA_URL\"" \
  --define:process.env.REACT_APP_SUPABASE_ANON_KEY="\"$SUPA_KEY\"" \
  --outfile=build/static/js/main.js
