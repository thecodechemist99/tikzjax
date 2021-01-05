# TikZJax

TikZJax converts `<script>` tags (containing TikZ code) into SVGs.

See a live demo at http://tikzjax.com/

## Example

In the `<head>` of your HTML, include
```html
<link rel="stylesheet" type="text/css" href="http://tikzjax.com/v1/fonts.css">
<script src="http://tikzjax.com/v1/tikzjax.js"></script>
```
Then in the `<body>`, include TikZ code such as
```html
<script type="text/tikz">
    \draw (0,0) circle (1in);
</script>
```

The TikZ code will be compiled into an SVG image, and the `<script>` element will be
replaced with a `<div>` element containing the generated SVG image.

## How does this work?

Using https://github.com/kisonecat/web2js the Pascal source of `tex` is compiled to
WebAssembly, and the latex format is loaded (without all the hyphenation data). Then
```
\documentclass[margin=0pt]{standalone}
\def\pgfsysdriver{pgfsys-ximera.def}
\usepackage[svgnames]{xcolor}
\usepackage{tikz}
```
is executed.  Then the core is dumped and compressed.  The WebAssembly and core are loaded
in the browser and executed.  An SVG driver for PGF along with
https://github.com/kisonecat/dvi2html are then utilized to convert the DVI output into to
an SVG image.

All of this happens in the browser.

## Options

There are several attributes that can be set for a "text/tikz" `<script>` tag.

First, if the `class` attribute is set, then that will be used for the `class` attribute
of the `<div>` element that is created containing the generated SVG image.

The values of the `width` and `height` attributes set on the `<script>` tag will be used
for the `width` and `height` style values of the containing `<div>` element.  If these
attributes are not set the `width` and `height` style values of the containing `<div>`
will be set to the computed width and height of the generated SVG image.  Note that the
generated SVG image will have the `width` and `height` style values both set to 100%.  So
the image will shrink or grow (maintaining its aspect ratio) to fit into the containing
`<div>`.

For example:
```
<script class="my-custom-class" width="200px" height="100px">...</script>
```
will result in
```
<div class="my-custom-class" style="width:200px;height:100px"><svg>...</svg></div>
```


</HEAD>
