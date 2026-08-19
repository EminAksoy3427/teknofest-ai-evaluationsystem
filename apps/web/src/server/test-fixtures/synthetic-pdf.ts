function escapePdfText(value: string): string {
  const encoded = new Map([
    ["İ", "\\200"],
    ["ı", "\\201"],
    ["Ğ", "\\202"],
    ["ğ", "\\203"],
    ["Ş", "\\204"],
    ["ş", "\\205"],
    ["Ç", "\\307"],
    ["ç", "\\347"],
    ["Ö", "\\326"],
    ["ö", "\\366"],
    ["Ü", "\\334"],
    ["ü", "\\374"],
  ]);
  return [...value]
    .map((character) => encoded.get(character) ?? character)
    .join("")
    .replaceAll("\\", "\\\\")
    .replaceAll("\\\\2", "\\2")
    .replaceAll("\\\\3", "\\3")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

export function createSyntheticTextPdf(pageTexts: readonly string[]): Uint8Array {
  if (pageTexts.length === 0) throw new Error("At least one synthetic page is required");

  const encoder = new TextEncoder();
  const objects = new Map<number, string>();
  const pageReferences: string[] = [];
  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    3,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [128 /Idotaccent /dotlessi /Gbreve /gbreve /Scedilla /scedilla] >> >>",
  );

  pageTexts.forEach((text, index) => {
    const pageId = 4 + index * 2;
    const contentId = pageId + 1;
    pageReferences.push(`${pageId} 0 R`);
    objects.set(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    const commands =
      text === ""
        ? "q Q"
        : `BT /F1 12 Tf 14 TL 72 720 Td ${text
            .split("\n")
            .map((line, lineIndex) => `${lineIndex > 0 ? "T* " : ""}(${escapePdfText(line)}) Tj`)
            .join(" ")} ET`;
    objects.set(
      contentId,
      `<< /Length ${encoder.encode(commands).byteLength} >>\nstream\n${commands}\nendstream`,
    );
  });
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pageTexts.length} >>`,
  );

  let source = "%PDF-1.4\n%synthetic\n";
  const offsets = [0];
  const maximumObjectId = 3 + pageTexts.length * 2;
  for (let objectId = 1; objectId <= maximumObjectId; objectId += 1) {
    offsets[objectId] = encoder.encode(source).byteLength;
    source += `${objectId} 0 obj\n${objects.get(objectId)}\nendobj\n`;
  }

  const xrefOffset = encoder.encode(source).byteLength;
  source += `xref\n0 ${maximumObjectId + 1}\n`;
  source += "0000000000 65535 f \n";
  for (let objectId = 1; objectId <= maximumObjectId; objectId += 1) {
    source += `${String(offsets[objectId]).padStart(10, "0")} 00000 n \n`;
  }
  source += `trailer\n<< /Size ${maximumObjectId + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return encoder.encode(source);
}
