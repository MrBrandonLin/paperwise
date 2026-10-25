// Reads a PDF the way macOS Preview does (Apple PDFKit) and prints JSON: every form widget with
// its value as PDFKit sees it, and how much "ink" PDFKit draws inside it (share of dark pixels).
// Used by test:pdf to check that filled values are visible in a reader other than pdf.js.
// Usage: swift scripts/lib/pdfkit-check.swift file.pdf
import CoreGraphics
import Foundation
import PDFKit

let path = CommandLine.arguments[1]
guard let doc = PDFDocument(url: URL(fileURLWithPath: path)) else {
  print("{\"error\":\"cannot open\"}")
  exit(1)
}

var fields: [[String: Any]] = []
let scale: CGFloat = 2
for i in 0..<doc.pageCount {
  guard let page = doc.page(at: i) else { continue }
  let box = page.bounds(for: .mediaBox)
  let w = Int(box.width * scale)
  let h = Int(box.height * scale)
  guard let ctx = CGContext(
    data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
    space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
  else { continue }
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
  ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  ctx.scaleBy(x: scale, y: scale)
  ctx.translateBy(x: -box.origin.x, y: -box.origin.y)
  page.draw(with: .mediaBox, to: ctx)
  guard let data = ctx.data?.bindMemory(to: UInt8.self, capacity: w * h * 4) else { continue }

  for ann in page.annotations where ann.type == "Widget" {
    // Inside the widget, 2 pt in from its edges (skip the printed box border).
    let r = ann.bounds.insetBy(dx: 2, dy: 2)
    var dark = 0
    var total = 0
    let x0 = max(0, Int((r.minX - box.origin.x) * scale))
    let x1 = min(w - 1, Int((r.maxX - box.origin.x) * scale))
    let y0 = max(0, Int((r.minY - box.origin.y) * scale))
    let y1 = min(h - 1, Int((r.maxY - box.origin.y) * scale))
    if x1 > x0 && y1 > y0 {
      for y in y0...y1 {
        let row = h - 1 - y  // bitmap memory starts at the top row
        for x in x0...x1 {
          let p = (row * w + x) * 4
          let lum = (Int(data[p]) + Int(data[p + 1]) + Int(data[p + 2])) / 3
          if lum < 128 { dark += 1 }
          total += 1
        }
      }
    }
    fields.append([
      "name": ann.fieldName ?? "",
      "page": i + 1,
      "value": ann.widgetStringValue ?? "",
      "on": ann.buttonWidgetState == .onState,
      "ink": total > 0 ? Double(dark) / Double(total) : 0,
    ])
  }
}
let json = try JSONSerialization.data(withJSONObject: ["pages": doc.pageCount, "fields": fields], options: [.sortedKeys])
print(String(data: json, encoding: .utf8)!)
