# Standard profile calibration provenance

The geometry in
`src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json`
was generated with `CalibrationSession` in its fixed Bottom → Right → Top →
Left order. Each seat contains a main-hand region, 13 ordered main slots, a
drawn slot, a river region plus one representative river tile, and a meld
region plus one representative meld tile. Every quadrilateral was entered as
Top Left → Top Right → Bottom Right → Bottom Left and normalized against a
1920×1080 image.

`MainTileScale` is the median bounding-box scale of the 13 main slots and is
also used for the drawn tile. `RiverTileScale` and `MeldTileScale` come directly
from their representative tile samples. There is no post-generation scale
override and no scale inferred from a clipped `DrawnSlot`. The generated
profile was serialized and reloaded through `ProfileLoader` validation.

| Seat | Main scale in pixels | River sample rectangle / scale | Meld sample rectangle / scale |
|---|---:|---|---|
| Bottom | `92×152` | `(768,542)–(827,619)` / `59×77` | `(1430,944)–(1512,1044)` / `82×100` |
| Right | `(899/13)×(906/13)` ≈ `69.15×69.69` | `(1139,294)–(1206,346)` / `67×52` | `(1518,42)–(1592,110)` / `74×68` |
| Top | `(615/13)×64` ≈ `47.31×64` | `(964,196)–(1014,258)` / `50×62` | `(393,32)–(450,91)` / `57×59` |
| Left | `65×(526/13)` ≈ `65×40.46` | `(631,290)–(700,345)` / `69×55` | `(66,872)–(145,964)` / `79×92` |

Main-slot measurements use the Early hand frame. All river samples use the
Populated rivers frame. Bottom meld uses the Populated rivers frame; Right,
Top, and Left meld samples use the All opponent melds frame.

The All opponent melds frame also exposes the maximum observed late-hand river
extents. Adjacent river regions use slanted, non-overlapping seams rather than
overlapping axis-aligned rectangles:

| Seat | River-region vertices in pixels (TL → TR → BR → BL) |
|---|---|
| Bottom | `(760,536)`, `(1137,536)`, `(1168,755)`, `(760,755)` |
| Right | `(1138,290)`, `(1395,290)`, `(1395,550)`, `(1168,550)` |
| Top | `(798,152)`, `(1122,152)`, `(1138,309)`, `(798,309)` |
| Left | `(526,289)`, `(776,289)`, `(759,551)`, `(526,551)` |

## Source frames

The private source frames and annotated verification images are not committed.
Their SHA-256 hashes record exactly which inputs were used:

| Frame | Original SHA-256 | Padded working-copy SHA-256 | Calibration use |
|---|---|---|---|
| Early hand | `0CC04A800FB3CF422E2CCD4FAF0D9F8285225246544A4275665AD9E8EDEE8F4F` | `87D84F6A159AC868F70F13456EF534D4E6B96E42D84F4283D70DFD229EB3F0B5` | Four concealed hands, 13 main slots, and the visible Bottom drawn tile |
| Populated rivers | `F89E677BAA782E8C190057C3A3E6A5F6FC883EE5DE7731BF077E00EB726461D0` | `CA05D232162C9CD6988DBEFC8B17F4856E85E33AA3240E199A2D51720AB7A49D` | All four river regions and representative river tiles; Bottom meld region and representative tile; Right meld-region validation |
| All opponent melds | `DA5AA7E7875CF152425A2E0190D0C839B45A6D58E231F98EA41953B32BB9CF31` | `E915D959E811BF93527E58EEF88E0893011E64FDEF3149B7006F5EB60E228EDE` | Maximum observed late-hand river extents; representative Right, Top, and Left meld tiles plus direct validation of their meld regions |

Each clipboard frame was 1919×1079, 32-bit ARGB. The working copy was padded
to 1920×1080 by copying source column 1918 to column 1919 and source row 1078
to row 1079; the bottom-right pixel was copied from `(1918, 1078)`. No image
was resized, stretched, cropped further, or synthesized.

Seat names follow the domain model, not image-quadrant shorthand:

- `Bottom`: viewer.
- `Right`: 下家, shown on the screen right; their melds appear at the
  upper-right edge.
- `Top`: opposite player, shown on the screen top; their melds appear at the
  upper-left edge.
- `Left`: 上家, shown on the screen left; their melds appear at the
  lower-left edge.

The uncommitted verification renders use yellow for main-hand envelopes,
green for main slots, cyan for drawn slots, red for rivers, and magenta for
meld regions. All three renders were inspected at 1920×1080. Regression tests
also assert that representative pixels from every hand, river, and directly
visible meld lie inside the corresponding normalized region.

## Known calibration limits

- Only Bottom has a directly visible separated draw in the early frame.
  Right, Top, and Left drawn locations are inferred from the independently
  oriented end of each full 13-tile hand and its expected separation gap.
  The inferred Right and Top quads retain only a safe evidence strip within
  the expected tile footprint so they cannot overlap their directly observed
  Right and Top meld regions. `MainTileScale` remains independent of those
  strips because it is derived from the 13 calibrated main slots. Left does
  not collide with another seat and retains its full inferred quad.
- After a call, a separated drawn tile moves with the shortened concealed
  hand. The single `DrawnSlot` field records the full-hand location. Detection
  for called hands must also use the ordered `MainSlots` occupancy and gap
  topology; it must not rely on the fixed drawn-slot quad alone.
- A meld region can overlap high-index concealed-hand coordinates across
  different game states because melds expand into space released when the
  concealed hand shortens. Event classification must reconcile hand, river,
  and meld count changes as one transaction.
- Occupancy thresholds remain the conservative profile defaults. They have
  not yet been tuned across alternate table skins, tile backs, display scales,
  or post-processing effects.
