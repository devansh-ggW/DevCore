!macro customInstall
  ; Register DevCore in Windows "Open with" for common developer/text files.
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'

  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".txt" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".md" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".json" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".js" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".jsx" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".ts" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".tsx" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".html" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".htm" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".css" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".py" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".java" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".c" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".h" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".cpp" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".hpp" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".cs" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".go" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".rs" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".xml" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".yaml" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".yml" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".sql" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".bat" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".cmd" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".ps1" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".vue" ""
  WriteRegStr HKCR "Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".svelte" ""

  ; Also keep a direct right-click entry for quick access.
  WriteRegStr HKCR "*\shell\DevCore" "" "Open with DevCore"
  WriteRegStr HKCR "*\shell\DevCore" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "*\shell\DevCore\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCR "Applications\${APP_EXECUTABLE_FILENAME}"
  DeleteRegKey HKCR "*\shell\DevCore"
!macroend
