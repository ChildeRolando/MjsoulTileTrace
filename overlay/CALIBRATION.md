# Standard profile calibration provenance

The geometry in
`src/MahjongSoulOverlay.Vision/Profiles/yonma-1920x1080.standard.json`
was generated with `CalibrationSession` in its fixed Bottom → Right → Top →
Left order. Each seat contains a main-hand region, 13 ordered main slots, a
drawn slot, a river region, and a meld region. Every quadrilateral was entered
as Top Left → Top Right → Bottom Right → Bottom Left and normalized against a
1920×1080 image.

After generation, Right and Top `ExpectedTileScale` were set to the full
inferred tile footprints (`70×62` and `52×66` pixels). This is an explicit
profile post-processing step: those two `DrawnSlot` quads were intentionally
clipped to smaller, non-overlapping evidence strips, so their bounding boxes
must not replace full-tile scale metadata. The adjusted profile was serialized
and reloaded through `ProfileLoader` validation.

## Source frames

The private source frames and annotated verification images are not committed.
Their SHA-256 hashes record exactly which inputs were used:

| Frame | Original SHA-256 | Padded working-copy SHA-256 | Calibration use |
|---|---|---|---|
| Early hand | `0CC04A800FB3CF422E2CCD4FAF0D9F8285225246544A4275665AD9E8EDEE8F4F` | `87D84F6A159AC868F70F13456EF534D4E6B96E42D84F4283D70DFD229EB3F0B5` | Four concealed hands, 13 main slots, and the visible Bottom drawn tile |
| Populated rivers | `F89E677BAA782E8C190057C3A3E6A5F6FC883EE5DE7731BF077E00EB726461D0` | `CA05D232162C9CD6988DBEFC8B17F4856E85E33AA3240E199A2D51720AB7A49D` | All four river regions; Bottom and 下家 (`Right`) meld regions |
| All opponent melds | `DA5AA7E7875CF152425A2E0190D0C839B45A6D58E231F98EA41953B32BB9CF31` | `E915D959E811BF93527E58EEF88E0893011E64FDEF3149B7006F5EB60E228EDE` | Repeat validation of Right plus direct validation of Top and Left meld regions |

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
  Right and Top meld regions. Their `ExpectedTileScale` values preserve the
  inferred full-tile dimensions. Left does not collide with another seat and
  retains its full inferred quad.
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
