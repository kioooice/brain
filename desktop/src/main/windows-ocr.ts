import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const WINDOWS_OCR_TIMEOUT_MS = 20_000;

export type WindowsOcrResult = {
  text: string;
  available: boolean;
  status: string;
};

const WINDOWS_OCR_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$imagePath = $env:BRAIN_OCR_IMAGE_PATH
if ([string]::IsNullOrWhiteSpace($imagePath)) {
  throw 'Missing image path'
}

Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Storage.StorageFile, Windows.Storage, ContentType=WindowsRuntime]
$null = [Windows.Storage.Streams.IRandomAccessStreamWithContentType, Windows.Storage.Streams, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Graphics.Imaging.SoftwareBitmap, Windows.Graphics.Imaging, ContentType=WindowsRuntime]
$null = [Windows.Media.Ocr.OcrEngine, Windows.Media.Ocr, ContentType=WindowsRuntime]

function Await-WinRt($Operation, [Type]$ResultType) {
  $method = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and $_.GetParameters().Count -eq 1
  } | Select-Object -First 1
  $task = $method.MakeGenericMethod($ResultType).Invoke($null, @($Operation))
  return $task.GetAwaiter().GetResult()
}

$stream = $null
try {
  $file = Await-WinRt ([Windows.Storage.StorageFile]::GetFileFromPathAsync($imagePath)) ([Windows.Storage.StorageFile])
  $stream = Await-WinRt ($file.OpenReadAsync()) ([Windows.Storage.Streams.IRandomAccessStreamWithContentType])
  $decoder = Await-WinRt ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bitmap = Await-WinRt ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
  if ($null -eq $engine) {
    throw 'Windows OCR engine is unavailable'
  }

  $result = Await-WinRt ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
  $text = ($result.Lines | ForEach-Object { $_.Text }) -join ([Environment]::NewLine)
  [Console]::Out.Write($text)
} finally {
  if ($null -ne $stream) {
    $stream.Dispose()
  }
}
`;

function getEncodedPowerShellCommand(script: string) {
  return Buffer.from(script, "utf16le").toString("base64");
}

export async function runWindowsOcr(imagePath: string): Promise<WindowsOcrResult> {
  try {
    const result = await execFileAsync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-EncodedCommand",
        getEncodedPowerShellCommand(WINDOWS_OCR_SCRIPT),
      ],
      {
        timeout: WINDOWS_OCR_TIMEOUT_MS,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        env: {
          ...process.env,
          BRAIN_OCR_IMAGE_PATH: imagePath,
        },
      }
    );

    const stdout = typeof result === "string" ? result : result.stdout;
    return {
      text: stdout.trim().replace(/\r\n/g, "\n"),
      available: true,
      status: "Windows OCR 已启用",
    };
  } catch {
    return {
      text: "",
      available: false,
      status: "Windows OCR 不可用，已先保存图片",
    };
  }
}
