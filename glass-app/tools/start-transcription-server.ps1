# Starts the private G2 transcription server without writing the API key to disk.
$secureKey = Read-Host 'Paste the replacement OpenAI API key (hidden input)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  node "$PSScriptRoot/transcription-server.mjs"
}
finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}
