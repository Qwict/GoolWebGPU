const shaderResponse = await fetch('./gool_vertex_shader.wgsl');
const shader = await shaderResponse.text();
const diamondShaderResponse = await fetch('./gool_diamond_vertex_shader.wgsl')
const diamondShader = diamondShaderResponse.text();
const computeShaderResponse = await fetch('./gool_compute_shader.wgsl');
const computeShader = await computeShaderResponse.text();

let GRID_SIZE = 256;
const UPDATE_INTERVAL = 16;
const WORKGROUP_SIZE = 8;
let step = 0; // Track how many simulation steps have been run
let fps = 0;
const START_TIME = Date.now()
const NEEDED_CALCULATIONS = Math.pow(GRID_SIZE, 2)
let b = document.getElementById("body"); //making var for body
console.log('Hi there; for more info press Escape')
window.addEventListener("keydown", function (event) {
  let current = document.getElementById("data").style.color
  if (event.key == 'Escape') {
    document.getElementById("data").style.color = current === "white" ? "black" : "white";
  } else if (event.altKey) {
    console.log(event.code)
    if (event.code == 'Minus') {
      GRID_SIZE -= 32
    } else if (event.code == 'Equal') {
      GRID_SIZE += 32
    }
    console.log(GRID_SIZE)
  }
});

window.addEventListener("keydown", function (event) {

});

// All render code in one function
function updateGrid() {
  let before = Date.now();
  const encoder = device.createCommandEncoder();
  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();

  step++;

  // Start a render pass 
  const pass = encoder.beginRenderPass({
    colorAttachments: [{
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
      storeOp: "store",
    }]
  });

  // Draw the grid.
  pass.setPipeline(cellPipeline);
  pass.setBindGroup(0, bindGroups[step & 1]);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

  // End the render pass and submit the command buffer
  pass.end();
  device.queue.submit([encoder.finish()]);
  fps = Date.now();
  document.getElementById("data").innerHTML = `
  
  calc / s ${(NEEDED_CALCULATIONS * 1000 / UPDATE_INTERVAL).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}; fps ${(1000 * step / ((Date.now() - START_TIME))).toFixed(2)}
  `
}

if (!navigator.gpu) {
  throw new Error("WebGPU not supported on this browser.");
}
const adapter = await navigator.gpu.requestAdapter();

if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}
// Configure the canvas
const canvas = document.querySelector("canvas");
(window.onresize = () => {
  canvas.width = Math.min(document.body.clientWidth, document.body.clientHeight)
  canvas.height = Math.min(document.body.clientWidth, document.body.clientHeight)
})();

const context = canvas.getContext("webgpu");
const device = await adapter.requestDevice();
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
context.configure({
  device: device,
  format: canvasFormat,
});

// Create the vertices
const vertices = new Float32Array([
  //   X,    Y,
  -0.8, -0.8,
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8,
  0.8, 0.8,
  -0.8, 0.8,
]);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices);

// Create a uniform buffer that describes the grid.
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});
device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// Create an array representing the active state of each cell.
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  })
];

for (let i = 0; i < cellStateArray.length; i += 3) {
  cellStateArray[i] = Math.random() <= 0.5 ? 0 : 1;
}
device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

const vertexBufferLayout = {
  arrayStride: 8,
  attributes: [{
    format: "float32x2",
    offset: 0,
    shaderLocation: 0, // Position, see vertex shader
  }],
};


const cellShaderModule = device.createShaderModule({
  label: "Cell shader",
  code: shader
});

const simulationShaderModule = device.createShaderModule({
  label: "Game of Life simulation shader",
  code: computeShader
});

const bindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [{
    binding: 0,
    // Add GPUShaderStage.FRAGMENT here if you are using the `grid` uniform in the fragment shader.
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
    buffer: {} // Grid uniform buffer
  }, {
    binding: 1,
    visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
    buffer: { type: "read-only-storage" } // Cell state input buffer
  }, {
    binding: 2,
    visibility: GPUShaderStage.COMPUTE,
    buffer: { type: "storage" } // Cell state output buffer
  }]
});

const bindGroups = [
  device.createBindGroup({
    label: "Cell renderer bind group A",
    layout: bindGroupLayout,
    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[0] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[1] }
    }],
  }),
  device.createBindGroup({
    label: "Cell renderer bind group B",
    layout: bindGroupLayout,

    entries: [{
      binding: 0,
      resource: { buffer: uniformBuffer }
    }, {
      binding: 1,
      resource: { buffer: cellStateStorage[1] }
    }, {
      binding: 2,
      resource: { buffer: cellStateStorage[0] }
    }],
  }),
];

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [bindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout]
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [{
      format: canvasFormat
    }]
  }
});
// Create a compute pipeline that updates the game state.
const simulationPipeline = device.createComputePipeline({
  label: "Simulation pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  }
});

setInterval(updateGrid, UPDATE_INTERVAL);