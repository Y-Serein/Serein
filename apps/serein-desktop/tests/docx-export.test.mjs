import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import JSZip from "jszip";
import { markdownToDocxBytes } from "../.test-dist/export/docxExport.js";

function readLatexFixture(name) {
  return fs.readFileSync(new URL(`./fixtures/latex/${name}`, import.meta.url), "utf8");
}

async function docxXml(markdown) {
  const bytes = await markdownToDocxBytes(markdown, { title: "SCI Math" });
  assert.equal(String.fromCharCode(...bytes.slice(0, 2)), "PK");
  const zip = await JSZip.loadAsync(Uint8Array.from(bytes));
  const documentXml = await zip.file("word/document.xml")?.async("string");
  const contentTypes = await zip.file("[Content_Types].xml")?.async("string");
  const settingsXml = await zip.file("word/settings.xml")?.async("string");
  const stylesXml = await zip.file("word/styles.xml")?.async("string");
  assert.ok(documentXml);
  assert.ok(contentTypes);
  assert.ok(settingsXml);
  assert.ok(stylesXml);
  return { documentXml, contentTypes, settingsXml, stylesXml };
}

test("exports editable native OMML with equation fields and references", async () => {
  const { documentXml, contentTypes, settingsXml, stylesXml } = await docxXml([
    "# Objective",
    "",
    "Forward \\eqref{eq:gradient}.",
    "",
    "\\begin{equation}",
    "\\nabla F(\\boldsymbol{\\theta})=\\boldsymbol{J}^{\\mathsf{T}}(\\boldsymbol{\\theta})\\boldsymbol{r}(\\boldsymbol{\\theta}).",
    "\\label{eq:gradient}",
    "\\end{equation}",
    "",
    "\\[",
    "\\frac{1}{2}\\sum_{i=1}^{n}r_i^2",
    "\\]",
    "",
    "\\[",
    "f(x)=\\begin{cases}x^2,&x\\ge0\\\\-x,&x<0\\end{cases}",
    "\\]",
    "",
    "\\[",
    "A=\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}",
    "\\]",
  ].join("\n"));

  assert.match(contentTypes, /wordprocessingml\.document\.main\+xml/);
  assert.match(settingsXml, /<w:updateFields\/>/);
  assert.match(settingsXml, /<m:mathFont m:val="Cambria Math"\/>/);
  assert.match(stylesXml, /<w:docDefaults>[\s\S]*?<w:rFonts[^>]*w:ascii="Times New Roman"/);
  assert.match(stylesXml, /<w:docDefaults>[\s\S]*?<w:rFonts[^>]*w:eastAsia="SimSun"/);
  assert.match(stylesXml, /<w:docDefaults>[\s\S]*?<w:sz w:val="24"\/>/);
  assert.match(stylesXml, /<w:style w:type="paragraph" w:styleId="Heading1">[\s\S]*?<w:rFonts[^>]*w:eastAsia="SimHei"[\s\S]*?<w:sz w:val="32"\/>/);
  assert.match(stylesXml, /<w:style w:type="paragraph" w:styleId="Heading2">[\s\S]*?<w:rFonts[^>]*w:eastAsia="SimHei"[\s\S]*?<w:sz w:val="28"\/>/);
  for (const styleId of ["Title", "Heading1", "Heading2", "Heading3"]) {
    assert.equal((stylesXml.match(new RegExp(`w:styleId="${styleId}"`, "g")) ?? []).length, 1);
  }
  assert.match(documentXml, /<m:oMath/);
  assert.match(documentXml, /<m:oMathPara>/);
  assert.match(documentXml, /<m:sSup>/);
  assert.match(documentXml, /<m:sup>/);
  assert.match(documentXml, /<m:f>/);
  assert.match(documentXml, /<m:nary>/);
  assert.match(documentXml, /<m:m>/);
  assert.match(documentXml, /<m:d>/);
  assert.match(documentXml, /<m:sty m:val="bi"/);
  assert.match(documentXml, /<m:scr m:val="sans-serif"/);
  assert.match(documentXml, /w:instr="SEQ Equation [^"]*ARABIC"/);
  assert.match(documentXml, /w:instr="REF SereinEq_/);
  assert.match(documentXml, /<w:bookmarkStart/);
  assert.match(documentXml, /<w:tab w:val="center" w:pos="4513"\/>/);
  assert.match(documentXml, /<w:tab w:val="right" w:pos="9026"\/>/);
  assert.doesNotMatch(documentXml, /<w:tbl>/);
  assert.doesNotMatch(documentXml, /<m:t[^>]*>eq:gradient<\/m:t>/);
  const superscripts = [...documentXml.matchAll(/<m:sSup>([\s\S]*?)<\/m:sSup>/g)];
  assert.ok(superscripts.length > 0);
  superscripts.forEach((match) => {
    assert.match(match[1], /<m:e>[\s\S]*<\/m:e>\s*<m:sup>/);
    assert.doesNotMatch(match[1], /<\/m:e>\s*<m:e>/);
  });
  assert.doesNotMatch(documentXml, /bookmarkUniqueNumericId|<undefined>/);
});

test("binds sums, products, and integrals to non-empty native OMML operands", async () => {
  const { documentXml } = await docxXml([
    "\\[\\sum_{i=1}^{n}r_i^2\\]",
    "",
    "\\[a+\\prod_{i=1}^{n}p_i q_i+b\\]",
    "",
    "\\[\\int_0^1 f(x)\\,\\mathrm{d}x+C\\]",
  ].join("\n"));

  const naries = [...documentXml.matchAll(/<m:nary>([\s\S]*?)<\/m:nary>/g)];
  assert.equal(naries.length, 3);
  for (const match of naries) {
    assert.doesNotMatch(match[1], /<m:e\/>/);
    assert.match(match[1], /<m:e>[\s\S]*?<m:t[^>]*>/);
  }
  assert.match(documentXml, /<m:chr m:val="∑"\/>[\s\S]*?<m:e>[\s\S]*?>r<\/m:t>/);
  assert.match(documentXml, /<m:chr m:val="∏"\/>[\s\S]*?<m:e>[\s\S]*?>p<\/m:t>[\s\S]*?>q<\/m:t>/);
  assert.match(documentXml, /<m:chr m:val="∫"\/>[\s\S]*?<m:e>[\s\S]*?>f<\/m:t>[\s\S]*?>d<\/m:t>[\s\S]*?>x<\/m:t>/);
});

test("keeps align numbering, notag rows, and subequation references", async () => {
  const { documentXml } = await docxXml([
    "\\begin{subequations}",
    "\\label{eq:system}",
    "\\begin{align}",
    "a &= b\\label{eq:a} \\\\",
    "c &= d\\label{eq:b}",
    "\\end{align}",
    "\\end{subequations}",
    "",
    "Refs \\eqref{eq:system}, \\ref{eq:a}, and \\eqref{eq:b}.",
    "",
    "\\begin{align}",
    "e &= f \\notag \\\\",
    "g &= h\\label{eq:next}",
    "\\end{align}",
    "",
    "Next \\eqref{eq:next}.",
  ].join("\n"));

  assert.match(documentXml, /SEQ Equation [^"]*ARABIC/);
  assert.match(documentXml, /SEQ Equation \\c [^"]*ARABIC/);
  assert.match(documentXml, />a<\/w:t>/);
  assert.match(documentXml, />b<\/w:t>/);
  assert.match(documentXml, /REF SereinEq_eq_system_/);
  assert.match(documentXml, /REF SereinEq_eq_a_/);
  assert.match(documentXml, /REF SereinEq_eq_b_/);
  assert.match(documentXml, /REF SereinEq_eq_next_/);
  assert.doesNotMatch(documentXml, /<w:tbl>/);
  assert.doesNotMatch(documentXml, /bookmarkUniqueNumericId|<undefined>/);
});

test("maps Markdown structure inside a LaTeX document wrapper to native Word structure", async () => {
  const { documentXml } = await docxXml([
    "\\documentclass{article}",
    "\\usepackage{amsmath,amssymb,bm}",
    "\\begin{document}",
    "# 一级标题",
    "",
    "其等价向量形式为",
    "\\begin{equation}",
    "F(\\boldsymbol{\\theta})=\\frac{1}{2}\\boldsymbol{r}^{\\mathsf{T}}(\\boldsymbol{\\theta})\\boldsymbol{r}(\\boldsymbol{\\theta}).",
    "\\label{eq:nls-vector}",
    "\\end{equation}",
    "",
    "再次使用 \\(\\boldsymbol{J}^{\\mathsf{T}}\\boldsymbol{r}\\)。",
    "\\end{document}",
  ].join("\n"));

  assert.match(documentXml, /<w:pStyle w:val="Heading1"\/>/);
  assert.match(documentXml, />一级标题<\/w:t>/);
  assert.match(documentXml, />其等价向量形式为<\/w:t>/);
  assert.match(documentXml, /<m:oMath/);
  assert.match(documentXml, /<m:scr m:val="sans-serif"/);
  assert.doesNotMatch(documentXml, /# 一级标题|documentclass|usepackage|begin\{document}|end\{document}/);
  assert.doesNotMatch(documentXml, /bookmarkUniqueNumericId|<undefined>/);
});

test("keeps preamble newcommands available to native Word equations", async () => {
  const { documentXml } = await docxXml([
    "\\documentclass{article}",
    "\\newcommand{\\Verify}[2]{\\operatorname{Verify}_{#1}(#2)}",
    "\\begin{document}",
    "\\begin{equation}",
    "\\Verify{pk_i}{m_i}=1",
    "\\end{equation}",
    "\\end{document}",
  ].join("\n"));

  assert.match(documentXml, /<m:oMath/);
  assert.match(documentXml, />Verify<\/m:t>/);
  assert.match(documentXml, />p<\/m:t>/);
  assert.match(documentXml, />k<\/m:t>/);
  assert.match(documentXml, />i<\/m:t>/);
  assert.doesNotMatch(documentXml, /\\Verify|newcommand|serein-math-error/);
});

test("exports generated scientific LaTeX fixtures as native Word structure", async () => {
  const fixtures = [
    ["nonlinear-least-squares.tex", "非线性最小二乘方法"],
    ["bezier-curves.tex", "贝塞尔曲线公式推演"],
    ["scientific-structures.tex", "科学公式结构回归"],
  ];

  for (const [fixtureName, title] of fixtures) {
    const { documentXml } = await docxXml(readLatexFixture(fixtureName));
    assert.match(documentXml, /<w:pStyle w:val="Title"\/>/);
    assert.match(documentXml, new RegExp(`>${title}<\\/w:t>`));
    assert.match(documentXml, /<w:pStyle w:val="Heading1"\/>/);
    assert.match(documentXml, /<m:oMath/);
    assert.match(documentXml, /<m:sty m:val="bi"/);
    assert.doesNotMatch(documentXml, /\\bm|serein-math-error/);
    assert.doesNotMatch(documentXml, /<w:t[^>]*>\\(?:begin|boxed|frac|sum|operatorname)/);
    assert.doesNotMatch(documentXml, /documentclass|usepackage|maketitle|\\(?:chapter|section|subsection)/);
    assert.doesNotMatch(documentXml, /bookmarkUniqueNumericId|<undefined>/);
  }
});

test("maps report chapter, section, and subsection levels to Word headings", async () => {
  const { documentXml } = await docxXml(readLatexFixture("scientific-structures.tex"));
  assert.match(documentXml, /<w:pStyle w:val="Heading1"\/>[\s\S]*?>基础结构<\/w:t>/);
  assert.match(documentXml, /<w:pStyle w:val="Heading2"\/>[\s\S]*?>分段函数与矩阵<\/w:t>/);
  assert.match(documentXml, /<w:pStyle w:val="Heading3"\/>[\s\S]*?>长公式与集中公式<\/w:t>/);
  assert.match(documentXml, /<w:pStyle w:val="Heading4"\/>[\s\S]*?>无编号公式<\/w:t>/);
});
