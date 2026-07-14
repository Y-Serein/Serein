import test from "node:test";
import assert from "node:assert/strict";
import { looksLikeMarkdownBlockPaste } from "../.test-dist/editor/markdownPaste.js";

test("detects Markdown source blocks pasted into Rich Edit", () => {
  const markdown = [
    "# vibe-bridge",
    "",
    "### 设备挂载",
    "",
    "```bash",
    "usbipd list",
    "# usbipd bind --busid 8-1",
    "ls /dev/hid*",
    "```",
  ].join("\n");

  assert.equal(looksLikeMarkdownBlockPaste(markdown), true);
});

test("does not treat single-line shell comments as markdown block paste", () => {
  assert.equal(looksLikeMarkdownBlockPaste("# usbipd bind --busid 8-1"), false);
});

test("does not parse ordinary multiline prose through the markdown paste gate", () => {
  const text = [
    "first plain line",
    "second plain line",
  ].join("\n");

  assert.equal(looksLikeMarkdownBlockPaste(text), false);
});
