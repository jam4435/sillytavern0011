[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [Parameter(Mandatory = $true)]
  [string[]]$ColumnNames,

  [Parameter(Mandatory = $true)]
  [string[]]$RowNames,

  [string]$Prefix = 'generated',
  [ValidateRange(32, 512)]
  [int]$Size = 128,
  [ValidateRange(1, 100)]
  [int]$JpegQuality = 84
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$resolvedInput = (Resolve-Path -LiteralPath $InputPath).Path
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$resolvedOutput = (Resolve-Path -LiteralPath $OutputDirectory).Path

$sourceFile = [System.Drawing.Image]::FromFile($resolvedInput)
try {
  $source = [System.Drawing.Bitmap]::new($sourceFile)
} finally {
  $sourceFile.Dispose()
}

try {
  $columns = $ColumnNames.Count
  $rows = $RowNames.Count
  $cellWidth = $source.Width / $columns
  $cellHeight = $source.Height / $rows
  $jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
    Where-Object MimeType -eq 'image/jpeg' |
    Select-Object -First 1
  $encoderParameters = [System.Drawing.Imaging.EncoderParameters]::new(1)
  $encoderParameters.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
    [System.Drawing.Imaging.Encoder]::Quality,
    [long]$JpegQuality
  )

  try {
    for ($row = 0; $row -lt $rows; $row++) {
      for ($column = 0; $column -lt $columns; $column++) {
        $left = [int][Math]::Round($column * $cellWidth)
        $top = [int][Math]::Round($row * $cellHeight)
        $right = [int][Math]::Round(($column + 1) * $cellWidth)
        $bottom = [int][Math]::Round(($row + 1) * $cellHeight)
        $crop = [System.Drawing.Rectangle]::new($left, $top, $right - $left, $bottom - $top)
        $output = [System.Drawing.Bitmap]::new($Size, $Size)
        try {
          $graphics = [System.Drawing.Graphics]::FromImage($output)
          try {
            $graphics.Clear([System.Drawing.Color]::FromArgb(25, 21, 18))
            $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
            $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $graphics.DrawImage(
              $source,
              [System.Drawing.Rectangle]::new(0, 0, $Size, $Size),
              $crop,
              [System.Drawing.GraphicsUnit]::Pixel
            )
          } finally {
            $graphics.Dispose()
          }

          $fileName = '{0}_{1}_{2}.jpg' -f $Prefix, $ColumnNames[$column], $RowNames[$row]
          $output.Save((Join-Path $resolvedOutput $fileName), $jpegCodec, $encoderParameters)
        } finally {
          $output.Dispose()
        }
      }
    }
  } finally {
    $encoderParameters.Dispose()
  }

  [pscustomobject]@{
    Input = $resolvedInput
    SourceSize = "$($source.Width)x$($source.Height)"
    Grid = "${columns}x${rows}"
    CellSize = ('{0:0.##}x{1:0.##}' -f $cellWidth, $cellHeight)
    OutputSize = "${Size}x${Size}"
    OutputCount = $columns * $rows
    OutputDirectory = $resolvedOutput
  }
} finally {
  $source.Dispose()
}
