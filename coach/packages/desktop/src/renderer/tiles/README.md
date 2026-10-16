# Shared Mahjong tiles

Arena, Coach, and the offline Question Lab report use this same directory.
Question Lab embeds each unchanged SVG once as an isolated data image, retaining
this directory as the artwork owner and including LICENSE.txt in its report. `1m`–`9s` and `1z`–`7z` are
self-contained SVG containers of the selected B artwork, including its original
one-bamboo bird. The embedded PNGs are unchanged from
[zddd312/mahjong-tiles](https://github.com/zddd312/mahjong-tiles/tree/7629eeeba620ba9f0a98907bc40c0776523af989).
Honor filenames follow the app's riichi order: east, south, west, north, white,
green, red; the upstream set uses red, green, white for its last three honors.

`0m.svg`, `0p.svg`, and `0s.svg` are local red-five variants using B's blank
tile body and its dark red ink (`#801820`). Five-man uses the upstream `src/5m.svg`
outline at the same 80% width placement as B. Five-pin and five-sou use the
matching transparent vector outlines from
[lietxia/mahjong_graphic](https://github.com/lietxia/mahjong_graphic/tree/3e275804ff58325306710bef3a7406860444bc6a),
recolored red. Five-man and five-pin have a red dot in the middle-left whitespace;
five-sou has one on the upper centerline. The dot radius is 11 in the 272×360 canvas.
No external fonts, image URLs, or runtime rendering dependencies
are required.

Both sources use the M+ font terms; see [LICENSE.txt](LICENSE.txt). Upstream
credits include I.Mahjong by 內木一郎 and GL-MahjongTile by Gutenberg Labo.
