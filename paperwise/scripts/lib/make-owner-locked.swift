// Makes server/public/test/pdf/owner-locked.pdf: the rental test PDF, encrypted with an owner
// password only (opens without a password, "locked against changes", like many government
// forms). pdf-lib can't write such files; test:pdf checks the viewer's pdf.js fallback.
// Usage (macOS): swift scripts/lib/make-owner-locked.swift in.pdf out.pdf
import Foundation
import PDFKit

guard let doc = PDFDocument(url: URL(fileURLWithPath: CommandLine.arguments[1])) else { exit(1) }
let ok = doc.write(to: URL(fileURLWithPath: CommandLine.arguments[2]), withOptions: [.ownerPasswordOption: "paperwise-test-owner"])
exit(ok ? 0 : 1)
