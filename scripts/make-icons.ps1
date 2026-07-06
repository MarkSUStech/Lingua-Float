$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$buildDir = Join-Path $root 'build'
$androidRes = Join-Path $root 'android/app/src/main/res'
New-Item -ItemType Directory -Force $buildDir | Out-Null

function New-RoundRectPath {
  param(
    [float] $X,
    [float] $Y,
    [float] $Width,
    [float] $Height,
    [float] $Radius
  )

  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $Radius * 2
  $path.AddArc($X, $Y, $diameter, $diameter, 180, 90)
  $path.AddArc($X + $Width - $diameter, $Y, $diameter, $diameter, 270, 90)
  $path.AddArc($X + $Width - $diameter, $Y + $Height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($X, $Y + $Height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Draw-LinguaIcon {
  param(
    [int] $Size,
    [string] $Path
  )

  $bitmap = [System.Drawing.Bitmap]::new($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $scale = $Size / 256.0
  $base = New-RoundRectPath 0 0 $Size $Size (58 * $scale)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#10242b')), $base)

  $bubble = New-RoundRectPath (49 * $scale) (50 * $scale) (162 * $scale) (97 * $scale) (22 * $scale)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f5fbfa')), $bubble)

  $tail = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $tail.AddPolygon(@(
      [System.Drawing.PointF]::new(88 * $scale, 140 * $scale),
      [System.Drawing.PointF]::new(88 * $scale, 175 * $scale),
      [System.Drawing.PointF]::new(123 * $scale, 145 * $scale)
    ))
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#f5fbfa')), $tail)

  $pill = New-RoundRectPath (56 * $scale) (176 * $scale) (149 * $scale) (47 * $scale) (20 * $scale)
  $graphics.FillPath([System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#25a899')), $pill)

  $darkBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#10242b'))
  $accentBrush = [System.Drawing.SolidBrush]::new([System.Drawing.ColorTranslator]::FromHtml('#25a899'))
  $graphics.FillRectangle($darkBrush, 93 * $scale, 85 * $scale, 28 * $scale, 54 * $scale)
  $graphics.FillRectangle($darkBrush, 93 * $scale, 123 * $scale, 69 * $scale, 16 * $scale)
  $graphics.FillRectangle($accentBrush, 142 * $scale, 82 * $scale, 40 * $scale, 16 * $scale)
  $graphics.FillRectangle($accentBrush, 142 * $scale, 110 * $scale, 56 * $scale, 16 * $scale)

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

function Write-Ico {
  param(
    [string[]] $PngPaths,
    [string] $OutPath
  )

  $images = @($PngPaths | ForEach-Object {
      $bitmap = [System.Drawing.Bitmap]::new($_)
      $width = $bitmap.Width
      $height = $bitmap.Height
      $maskStride = [int]([Math]::Ceiling($width / 32.0) * 4)
      $ms = [System.IO.MemoryStream]::new()
      $bw = [System.IO.BinaryWriter]::new($ms)

      $bw.Write([uint32]40)
      $bw.Write([int32]$width)
      $bw.Write([int32]($height * 2))
      $bw.Write([uint16]1)
      $bw.Write([uint16]32)
      $bw.Write([uint32]0)
      $bw.Write([uint32]($width * $height * 4))
      $bw.Write([int32]0)
      $bw.Write([int32]0)
      $bw.Write([uint32]0)
      $bw.Write([uint32]0)

      for ($y = $height - 1; $y -ge 0; $y--) {
        for ($x = 0; $x -lt $width; $x++) {
          $pixel = $bitmap.GetPixel($x, $y)
          $bw.Write([byte]$pixel.B)
          $bw.Write([byte]$pixel.G)
          $bw.Write([byte]$pixel.R)
          $bw.Write([byte]$pixel.A)
        }
      }

      $emptyMaskRow = [byte[]]::new($maskStride)
      for ($y = 0; $y -lt $height; $y++) {
        $bw.Write($emptyMaskRow)
      }

      $bw.Flush()
      $bytes = $ms.ToArray()
      $bw.Dispose()
      $ms.Dispose()
      $bitmap.Dispose()

      [PSCustomObject]@{
        Size = $width
        Bytes = $bytes
      }
    })
  $stream = [System.IO.File]::Create($OutPath)
  $writer = [System.IO.BinaryWriter]::new($stream)
  $writer.Write([uint16]0)
  $writer.Write([uint16]1)
  $writer.Write([uint16]$images.Count)

  $offset = 6 + (16 * $images.Count)
  for ($i = 0; $i -lt $images.Count; $i++) {
    $size = [int]$images[$i].Size
    $icoSize = if ($size -ge 256) { 0 } else { $size }
    $writer.Write([byte]$icoSize)
    $writer.Write([byte]$icoSize)
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]32)
    $writer.Write([uint32]$images[$i].Bytes.Length)
    $writer.Write([uint32]$offset)
    $offset += $images[$i].Bytes.Length
  }

  foreach ($image in $images) {
    $writer.Write($image.Bytes)
  }

  $writer.Dispose()
  $stream.Dispose()
}

$pngSizes = @(16, 24, 32, 48, 64, 128, 256)
$pngPaths = foreach ($size in $pngSizes) {
  $path = Join-Path $buildDir "icon-$size.png"
  Draw-LinguaIcon -Size $size -Path $path
  $path
}

Copy-Item (Join-Path $buildDir 'icon-256.png') (Join-Path $buildDir 'icon.png') -Force
Write-Ico -PngPaths $pngPaths -OutPath (Join-Path $buildDir 'icon.ico')

$androidSizes = @{
  'mipmap-mdpi' = 48
  'mipmap-hdpi' = 72
  'mipmap-xhdpi' = 96
  'mipmap-xxhdpi' = 144
  'mipmap-xxxhdpi' = 192
}

foreach ($entry in $androidSizes.GetEnumerator()) {
  $dir = Join-Path $androidRes $entry.Key
  New-Item -ItemType Directory -Force $dir | Out-Null
  $tmp = Join-Path $buildDir "android-$($entry.Value).png"
  Draw-LinguaIcon -Size $entry.Value -Path $tmp
  Copy-Item $tmp (Join-Path $dir 'ic_launcher.png') -Force
  Copy-Item $tmp (Join-Path $dir 'ic_launcher_round.png') -Force
  Copy-Item $tmp (Join-Path $dir 'ic_launcher_foreground.png') -Force
}

Write-Host "Generated icon assets in $buildDir"
