# wkhtmltopdf

## Description

wkhtmltopdf is used to convert html to pdf.

The **wkhtmltox** in this dir is:

```
$ wkhtmltopdf --version
wkhtmltopdf 0.12.2.1 (with patched qt)
```

It's alias of wkhtmltopdf, to distinguish from the one in apt-get source.

This version with patched qt, supports more nice features.

## How to install

If use gdebi in graphic env, it's easy because gdebi will resolve the package dependence.

If use apt-get in shell evn, do as below:

```
$ sudo apt-get install fontconfig libfontconfig1 libjpeg8 libxrender1 xfonts-base xfonts-75dpi
```

And chinese fonts:

```
$ sudo apt-get install ttf-wqy-microhei ttf-wqy-zenhei
```

And itself:

```
$ sudo dpkg -i wkhtmltox-0.12.2.1_linux-precise-amd64.deb
```

## How to use

```
$ wkhtmltopdf -T 25 -R 25 -B 25 -L 25 --page-size A4 ./Hello.html ./Hello.pdf
```

Refer to `man wkhtmltopdf` for more info.
