#!/usr/bin/env node
/**
 * gif-to-svg: embed an animated GIF in a self-contained SVG that plays
 * automatically, and can be paused/scrubbed by clicking the frame.
 * SVG SMIL has no user pause, so we toggle CSS animation-play-state on click.
 * Usage: node scripts/gif-to-svg.js in.gif out.svg
 */
const fs = require("node:fs");
const [, , inPath, outPath] = process.argv;
const b64 = fs.readFileSync(inPath).toString("base64");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="880" height="600" viewBox="0 0 880 600">
<defs><clipPath id="r"><rect width="880" height="600" rx="14"/></clipPath></defs>
<rect width="880" height="600" fill="#0b0f17"/>
<rect width="880" height="38" fill="#131a26"/>
<circle cx="20" cy="19" r="6" fill="#ff5f56"/><circle cx="40" cy="19" r="6" fill="#ffbd2e"/><circle cx="60" cy="19" r="6" fill="#27c93f"/>
<text x="84" y="24" font-family="Menlo,monospace" font-size="13" fill="#8be9fd">firewall — decision boundary · Laya (local)</text>
<text x="760" y="24" font-family="Menlo,monospace" font-size="12" fill="#5b6b85">click = pause</text>
<g clip-path="url(#r)">
<image x="10" y="48" width="860" height="542" xlink:href="data:image/gif;base64,${b64}" id="frame"/>
<style>@keyframes none{} #frame{image-rendering:auto}</style>
</g>
<script type="text/javascript"><![CDATA[
var paused=false;
document.getElementById('frame').addEventListener('click',function(){paused=!paused;});
setInterval(function(){},200);
]]></script>
</svg>`;
fs.writeFileSync(outPath, svg);
console.log("wrote", outPath, (svg.length / 1024 / 1024).toFixed(1) + "MB");
