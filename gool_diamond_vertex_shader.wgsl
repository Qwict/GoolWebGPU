// Install WGSL Literal on vscode to get SYNTAX highlights in this code :)
struct VertexInput {
  @location(0) pos: vec2f,
  @builtin(instance_index) instance: u32,
};

struct VertexOutput {
  @builtin(position) pos: vec4f,
  @location(0) cell: vec2f,
};

@group(0) @binding(0) var<uniform> grid: vec2f;
@group(0) @binding(1) var<storage> cellState: array<u32>;


@vertex
fn vertexMain(input: VertexInput) -> VertexOutput  {
  let i = f32(input.instance);
  let cell = vec2f(i % grid.x, floor(i / grid.x));
  let state = f32(cellState[input.instance]);

  let cellOffset = cell / grid * 2;
  let gridPos = (input.pos*state+1) / grid - 1 + cellOffset;
  
  var output: VertexOutput;
  output.pos = vec4f(gridPos, 0, 1);
  output.cell = cell;
  return output;

}

struct FragInput {
  @location(0) cell: vec2f,
};


@fragment
fn fragmentMain(input: FragInput) -> @location(0) vec4f {
  let max = grid / 2;
  let closeX = abs(input.cell.x - max);
  let closeY = abs(input.cell.y - max);
  let closeToCenter = 1 - (closeX + closeY) / (0.5 * grid);
  return vec4f(closeToCenter - 0.5, closeToCenter.x, 1);
}