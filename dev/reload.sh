#!/bin/sh
# Reload the app in Chrome. `open -a "Google Chrome" index.html` only FOCUSES
# an already-open tab, so edits appear not to have landed; this forces it.
# Indexed loops with `try`: iterating `every tab` breaks if a tab closes or a
# window has none, which surfaces as "Invalid index (-1719)".
ROOT=$(cd "$(dirname "$0")/.." && pwd)
osascript <<AS
tell application "Google Chrome"
  set found to false
  repeat with i from 1 to (count of windows)
    try
      repeat with j from 1 to (count of tabs of window i)
        try
          if URL of tab j of window i contains "todo/index.html" then
            tell tab j of window i to reload
            set found to true
          end if
        end try
      end repeat
    end try
  end repeat
  if found then return "reloaded"
  open location "file://$ROOT/index.html"
  return "opened"
end tell
AS
