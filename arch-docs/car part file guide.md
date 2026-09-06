Blender Model Setup
1. Add Custom Properties to Meshes:
Select mesh → Object Properties → Custom Properties → Add:
- paintable = 1 (Integer)
- paintZone = "body" | "trim" | "interior" (String)
2. Name Attachment Nodes:
Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR
Hood
Front_Bumper, Rear_Bumper
Spoiler_Mount, Stock_Spoiler
Mirror_L, Mirror_R
Exhaust
Skirt_L, Skirt_R
3. Export:
GLB format
Enable DRACO compression
userData auto-exports
Create Part GLB Files
Match paths in public/config/car-parts.json:
/models/parts/wheels/stock.glb
/models/parts/spoilers/gt-wing.glb
... (24 files total)
Each part needs same pivot/orientation as target node.
Test
Visit /car/sample-car:
Paint tab → Change colors per zone (Body/Trim/Interior)
Parts tab → Click part → Should swap (if GLB exists)
W