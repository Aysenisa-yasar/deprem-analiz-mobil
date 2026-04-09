Add-Type -AssemblyName System.Drawing

$OutputDir = Join-Path $PSScriptRoot "..\\mobile\\assets\\images"
[System.IO.Directory]::CreateDirectory((Resolve-Path $OutputDir)) | Out-Null

function New-Color([int]$r, [int]$g, [int]$b, [int]$a = 255) {
  return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function Draw-Background($graphics, $width, $height, $transparent) {
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  if (-not $transparent) {
    $rect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $rect,
      (New-Color 7 11 24),
      (New-Color 18 33 64),
      45
    )
    $graphics.FillRectangle($brush, $rect)
    $brush.Dispose()

    $softBrush = New-Object System.Drawing.SolidBrush((New-Color 65 212 255 28))
    $graphics.FillEllipse($softBrush, -120, -80, [int]($width * 0.72), [int]($height * 0.72))
    $graphics.FillEllipse($softBrush, [int]($width * 0.48), [int]($height * 0.08), [int]($width * 0.46), [int]($height * 0.46))
    $softBrush.Dispose()

    $gridPen = New-Object System.Drawing.Pen((New-Color 191 212 255 20), 2)
    for ($x = 0; $x -lt $width; $x += [Math]::Max(32, [int]($width / 8))) {
      $graphics.DrawLine($gridPen, $x, 0, $x, $height)
    }
    for ($y = 0; $y -lt $height; $y += [Math]::Max(32, [int]($height / 8))) {
      $graphics.DrawLine($gridPen, 0, $y, $width, $y)
    }
    $gridPen.Dispose()
  }
}

function Draw-Mark($graphics, $width, $height, $showWordmark) {
  $cx = [double]$width / 2
  $cy = if ($showWordmark) { [double]$height * 0.42 } else { [double]$height / 2 }
  $size = [Math]::Min($width, $height) * $(if ($showWordmark) { 0.48 } else { 0.62 })

  $outerRect = New-Object System.Drawing.RectangleF(($cx - $size / 2), ($cy - $size / 2), $size, $size)
  $middleSize = $size * 0.74
  $middleRect = New-Object System.Drawing.RectangleF(($cx - $middleSize / 2), ($cy - $middleSize / 2), $middleSize, $middleSize)
  $innerSize = $size * 0.44
  $innerRect = New-Object System.Drawing.RectangleF(($cx - $innerSize / 2), ($cy - $innerSize / 2), $innerSize, $innerSize)

  $ringPen1 = New-Object System.Drawing.Pen((New-Color 82 215 255 185), [Math]::Max(6, $size * 0.02))
  $ringPen2 = New-Object System.Drawing.Pen((New-Color 255 130 76 210), [Math]::Max(5, $size * 0.017))
  $ringPen3 = New-Object System.Drawing.Pen((New-Color 230 241 255 150), [Math]::Max(4, $size * 0.014))
  $graphics.DrawEllipse($ringPen1, $outerRect)
  $graphics.DrawEllipse($ringPen2, $middleRect)
  $graphics.DrawEllipse($ringPen3, $innerRect)
  $ringPen1.Dispose()
  $ringPen2.Dispose()
  $ringPen3.Dispose()

  $glowBrush = New-Object System.Drawing.SolidBrush((New-Color 255 142 76 255))
  $glowSize = $size * 0.12
  $graphics.FillEllipse($glowBrush, ($cx - $glowSize / 2), ($cy - $glowSize / 2), $glowSize, $glowSize)
  $glowBrush.Dispose()

  $faultPen = New-Object System.Drawing.Pen((New-Color 255 142 76 160), [Math]::Max(5, $size * 0.018))
  $graphics.DrawLine($faultPen, $cx - $size * 0.45, $cy + $size * 0.12, $cx + $size * 0.44, $cy - $size * 0.33)
  $faultPen.Dispose()

  $waveY = $cy + $size * 0.23
  $waveLeft = $cx - $size * 0.28
  $waveRight = $cx + $size * 0.28
  $barGap = ($waveRight - $waveLeft) / 7
  $bars = @(0.36, 0.72, 0.48, 0.96, 0.58, 0.82, 0.4)
  for ($i = 0; $i -lt $bars.Count; $i++) {
    $barHeight = $size * 0.18 * $bars[$i]
    $barX = $waveLeft + ($barGap * $i)
    $barBrush = New-Object System.Drawing.SolidBrush($(if ($i % 3 -eq 1) { New-Color 255 142 76 } else { New-Color 82 215 255 }))
    $graphics.FillRoundedRectangle($barBrush, [System.Drawing.RectangleF]::new(($barX - 7), ($waveY - $barHeight / 2), 14, $barHeight), 7)
    $barBrush.Dispose()
  }

  if ($showWordmark) {
    $titleFont = New-Object System.Drawing.Font("Segoe UI Semibold", [Math]::Max(32, [int]($width * 0.04)), [System.Drawing.FontStyle]::Bold)
    $subFont = New-Object System.Drawing.Font("Segoe UI", [Math]::Max(16, [int]($width * 0.015)), [System.Drawing.FontStyle]::Regular)
    $titleBrush = New-Object System.Drawing.SolidBrush((New-Color 242 248 255))
    $subBrush = New-Object System.Drawing.SolidBrush((New-Color 183 199 232))
    $center = New-Object System.Drawing.StringFormat
    $center.Alignment = [System.Drawing.StringAlignment]::Center
    $center.LineAlignment = [System.Drawing.StringAlignment]::Center
    $graphics.DrawString("DepremAnaliz", $titleFont, $titleBrush, [float]$cx, [float]($cy + $size * 0.48), $center)
    $graphics.DrawString("Canli risk haritasi, acil mesaj ve Nearby P2P", $subFont, $subBrush, [float]$cx, [float]($cy + $size * 0.63), $center)
    $titleFont.Dispose()
    $subFont.Dispose()
    $titleBrush.Dispose()
    $subBrush.Dispose()
    $center.Dispose()
  }
}

Update-TypeData -TypeName System.Drawing.Graphics -MemberType ScriptMethod -MemberName FillRoundedRectangle -Value {
  param($brush, [System.Drawing.RectangleF]$rect, [single]$radius)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  $this.FillPath($brush, $path)
  $path.Dispose()
} -Force

function Save-Asset($path, $width, $height, $transparent, $showWordmark) {
  $bitmap = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.Clear([System.Drawing.Color]::Transparent)
  Draw-Background $graphics $width $height $transparent
  Draw-Mark $graphics $width $height $showWordmark
  $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

Save-Asset (Join-Path $OutputDir "icon-v2.png") 1024 1024 $false $false
Save-Asset (Join-Path $OutputDir "favicon-v2.png") 256 256 $false $false
Save-Asset (Join-Path $OutputDir "adaptive-icon-v2.png") 1024 1024 $true $false
Save-Asset (Join-Path $OutputDir "splash-icon-v2.png") 1400 1400 $true $true
