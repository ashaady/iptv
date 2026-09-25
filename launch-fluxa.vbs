Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\abtru\Documents\Playground\fluxa-iptv"
WshShell.Run """C:\Users\abtru\Documents\Playground\fluxa-iptv\node_modules\electron\dist\electron.exe"" .", 1, False
