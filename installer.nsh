!macro customInstall
  ; Add DevCore to the right-click context menu for files.
  WriteRegStr HKCR "*\\shell\\DevCore" "" "Open with DevCore"
  WriteRegStr HKCR "*\\shell\\DevCore" "Icon" "$INSTDIR\\${APP_EXECUTABLE_FILENAME}"
  WriteRegStr HKCR "*\\shell\\DevCore\\command" "" '"$INSTDIR\\${APP_EXECUTABLE_FILENAME}" "%1"'
!macroend

!macro customUnInstall
  ; Remove the context-menu entry when DevCore is uninstalled.
  DeleteRegKey HKCR "*\\shell\\DevCore"
!macroend
