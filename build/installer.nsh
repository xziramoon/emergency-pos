; Lets phones on the shop network reach the print relay (design 5.3). The relay still needs the paired token.
!macro customInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Emergency POS print relay"'
  nsExec::Exec 'netsh advfirewall firewall add rule name="Emergency POS print relay" dir=in action=allow program="$INSTDIR\${APP_EXECUTABLE_FILENAME}" profile=private,public enable=yes'
!macroend

!macro customUnInstall
  nsExec::Exec 'netsh advfirewall firewall delete rule name="Emergency POS print relay"'
!macroend
