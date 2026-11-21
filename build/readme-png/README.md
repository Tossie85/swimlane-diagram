# README 用の PNG を作る

Marketplace は README の SVG を受け付けない（vsce がエラーにする）ので、拡張2本の
README には PNG を置いている。その PNG を `docs/example.svg` から作る道具。

**ブラウザに描かせているのは字面を合わせるため。** SVG が指定しているフォント
（Inter / Yu Gothic UI）は Windows 側にあり、WSL の cairosvg で描くと日本語が
豆腐（□）になる。canvas に2倍で描いて PNG にし、`save.php` が `out/` に置く。

## 使い方

図を描き直したあと（`npm run example`）、リポジトリの根で:

```
php -S 127.0.0.1:8012                  # 別の端末で動かしたままにする
# ブラウザで http://127.0.0.1:8012/build/readme-png/ を開く。
# 開いた時点で out/ に PNG が落ちる（画面に落ちた大きさが出る）
python3 build/readme-png/quantize.py   # 64色に減色して拡張2本の docs/ に配る
```

- `index.html` … `docs/example.svg` と英語版を2倍の canvas に描いて投げる
- `save.php` … 受け取った PNG を `out/` に置くだけ
- `quantize.py` … 64色に減色（ディザ無し）して配る。1枚 50KB 前後になる

できた PNG は 1580 x 2324 前後。`out/` は git に入れない（`.gitignore`）。
