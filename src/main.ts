import "./style.css"

const vsSource = `\
#version 300 es
out vec2 texcoord;
void main() {
    gl_Position = vec4(vec2[](
        vec2(-1, -1), vec2(-1,  1), vec2( 1,  1), 
        vec2(-1, -1), vec2( 1,  1), vec2( 1, -1)
    )[gl_VertexID], 0, 1);
    texcoord = vec2[](
        vec2(0, 1), vec2(0, 0), vec2(1, 0), 
        vec2(0, 1), vec2(1, 0), vec2(1, 1)
    )[gl_VertexID];
}
`;

const fsHeader = `\
#version 300 es
precision highp float;
in vec2 texcoord;
out vec4 outcolor;
`;

const fsMain = `\
void main() {
    mainImage(outcolor, texcoord);
}
`;

const templateCode = `\
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    fragColor = vec4(fragCoord, 0, 1);
}
`;

function hexToRgb(hex: string) {
    // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
    var shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, function (_, r, g, b) {
        return r + r + g + g + b + b;
    });

    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16) / 255,
        g: parseInt(result[2], 16) / 255,
        b: parseInt(result[3], 16) / 255,
    } : null;
}

import { v4 as uuidv4 } from 'uuid';

let canvas = document.querySelector<HTMLCanvasElement>("#gl-canvas")!;
let gl = canvas.getContext("webgl2")!;

let vs = gl.createShader(gl.VERTEX_SHADER)!;
gl.shaderSource(vs, vsSource);
gl.compileShader(vs);

let textureMap = new Map<string, { name: string, image: HTMLImageElement, wrap: GLenum, filter: GLenum }>();
let colorMap = new Map<string, { name: string, color: string }>();

if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
    console.log(gl.getShaderInfoLog(vs));
    gl.deleteShader(vs);
    throw new Error();
}

{
    let uploadInput = document.querySelector<HTMLInputElement>("#texture-upload")!;
    uploadInput.onchange = () => {
        if (uploadInput.files) {
            const file = uploadInput.files![0];
            const reader = new FileReader();
            let newImage = new Image();
            reader.onload = () => {
                newImage.src = reader.result as string;
                newImage.onload = () => {
                    const key = uuidv4();
                    const container = document.querySelector<HTMLDivElement>("#texture-list")!.appendChild(document.createElement("div"));
                    container.className = "texture-container"
                    const thumbnail = container.appendChild(newImage);
                    thumbnail.className = "texture-thumbnail";
                    thumbnail.style.width = "100px";
                    thumbnail.style.height = "100px";
                    const wrapSelect = container.appendChild(document.createElement("select"));
                    wrapSelect.className = "wrap-select";
                    {
                        const wrapSelectClamp = wrapSelect.appendChild(document.createElement("option"));
                        wrapSelectClamp.value = "clamp";
                        wrapSelectClamp.innerText = "clamp"
                        const wrapSelectRepeat = wrapSelect.appendChild(document.createElement("option"));
                        wrapSelectRepeat.value = "repeat";
                        wrapSelectRepeat.innerText = "repeat"
                    }
                    wrapSelect.onchange = () => {
                        if (wrapSelect.value == "clamp") {
                            textureMap.get(key)!.wrap = gl.CLAMP_TO_EDGE;
                        }
                        else {
                            textureMap.get(key)!.wrap = gl.REPEAT;
                        }
                    };
                    const filterSelect = container.appendChild(document.createElement("select"));
                    {
                        const filterSelectNearest = filterSelect.appendChild(document.createElement("option"));
                        filterSelectNearest.value = "nearest";
                        filterSelectNearest.innerText = "nearest"
                        const filterSelectLinear = filterSelect.appendChild(document.createElement("option"));
                        filterSelectLinear.value = "linear";
                        filterSelectLinear.innerText = "linear"
                    }
                    filterSelect.className = "filter-select";
                    filterSelect.onchange = () => {
                        if (filterSelect.value == "nearest") {
                            textureMap.get(key)!.filter = gl.NEAREST;
                        }
                        else {
                            textureMap.get(key)!.filter = gl.LINEAR;
                        }
                    };
                    const nameEdit = container.appendChild(document.createElement("input"));
                    nameEdit.type = "text";
                    nameEdit.value = "tex" + textureMap.size;
                    nameEdit.onchange = () => {
                        textureMap.get(key)!.name = nameEdit.value;
                    }
                    const deleteBtn = container.appendChild(document.createElement("button"));
                    deleteBtn.textContent = "X";
                    deleteBtn.onclick = () => {
                        container.remove();
                        textureMap.delete(key);
                    };
                    textureMap.set(key, { image: newImage, name: nameEdit.value, wrap: gl.CLAMP_TO_EDGE, filter: gl.NEAREST });
                };
            };
            reader.readAsDataURL(file);
        }
    };
}

{
    let colorBtn = document.querySelector<HTMLButtonElement>("#color-btn")!;
    colorBtn.onclick = () => {
        const key = uuidv4();
        const container = document.querySelector<HTMLDivElement>("#color-list")!.appendChild(document.createElement("div"));
        container.className = "color-container"
        const colorInput = container.appendChild(document.createElement("input"));
        colorInput.type = "color";
        colorInput.onchange = () => {
            colorMap.set(key, { name: nameEdit.value, color: colorInput.value });
        };
        const nameEdit = container.appendChild(document.createElement("input"));
        nameEdit.type = "text";
        nameEdit.value = "col" + colorMap.size;
        nameEdit.onchange = () => {
            colorMap.get(key)!.name = nameEdit.value;
        }
        const deleteBtn = container.appendChild(document.createElement("button"));
        deleteBtn.textContent = "X";
        deleteBtn.onclick = () => {
            container.remove();
            colorMap.delete(key);
        };
        colorMap.set(key, { name: nameEdit.value, color: colorInput.value });
    };
}

document.querySelector<HTMLButtonElement>("#reload-btn")!.onclick = updateCanvas;

function renderCanvas() {
    let program = gl.createProgram();
    gl.attachShader(program, vs);
    let fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    {
        let texNames = "";
        textureMap.forEach((value) => {
            texNames += "uniform sampler2D " + value.name + ";\n";
        });
        let colNames = "";
        colorMap.forEach((value) => {
            let rgb = hexToRgb(value.color);
            if (rgb) {
                colNames += "vec4 " + value.name + " = vec4(" + rgb.r + ", " + rgb.g + ", " + rgb.b + ", 1);\n";
            }
        });
        gl.shaderSource(fs, fsHeader + texNames + colNames + view.state.doc + fsMain);
    }
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.log(gl.getShaderInfoLog(fs));
        gl.deleteShader(fs);
        throw new Error();
    }
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.log(gl.getProgramInfoLog(program));
    }
    gl.deleteShader(fs);

    gl.useProgram(program);

    {
        let i = 0;
        textureMap.forEach((value) => {
            const tex = gl.createTexture();
            gl.activeTexture(gl.TEXTURE0 + i);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            const image = value.image;
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, value.wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, value.wrap);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, value.filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, value.filter);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, image.naturalWidth, image.naturalHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.uniform1i(gl.getUniformLocation(program, value.name), i);
            ++i;
        });
    }

    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
};

let outputWidth = document.querySelector<HTMLInputElement>("#output-width")!;
let outputHeight = document.querySelector<HTMLInputElement>("#output-height")!;
let outputAspectFixed = document.querySelector<HTMLInputElement>("#output-aspect-fixed")!;
let viewWidth = document.querySelector<HTMLInputElement>("#view-width")!;
let viewHeight = document.querySelector<HTMLInputElement>("#view-height")!;
let viewAspectFixed = document.querySelector<HTMLInputElement>("#view-aspect-fixed")!;

function updateCanvas() {
    canvas.width = parseInt(outputWidth.value);
    canvas.height = parseInt(outputHeight.value);
    canvas.style.width = viewWidth.value + "px";
    canvas.style.height = viewHeight.value + "px";
    renderCanvas();
}

outputWidth.onchange = () => {
    let lastOutputWidth = canvas.width;
    let lastOutputHeight = canvas.height;
    let lastAspect = lastOutputWidth / lastOutputHeight;

    outputWidth.value = eval(outputWidth.value);

    if (outputAspectFixed.checked) {
        outputHeight.value = (parseInt(outputWidth.value) / lastAspect).toString();
    }

    updateCanvas();
};
outputHeight.onchange = () => {
    let lastOutputWidth = canvas.width;
    let lastOutputHeight = canvas.height;
    let lastAspect = lastOutputWidth / lastOutputHeight;

    outputHeight.value = eval(outputHeight.value);

    if (outputAspectFixed.checked) {
        outputWidth.value = (parseInt(outputHeight.value) * lastAspect).toString();
    }

    updateCanvas();
};
viewWidth.onchange = () => {
    let lastViewWidth = parseInt(canvas.style.width.replace("px", ""));
    let lastViewHeight = parseInt(canvas.style.height.replace("px", ""));
    let lastAspect = lastViewWidth / lastViewHeight;

    viewWidth.value = eval(viewWidth.value);

    if (viewAspectFixed.checked) {
        viewHeight.value = (parseInt(viewWidth.value) / lastAspect).toString();
    }

    updateCanvas();
};
viewHeight.onchange = () => {
    let lastViewWidth = parseInt(canvas.style.width.replace("px", ""));
    let lastViewHeight = parseInt(canvas.style.height.replace("px", ""));
    let lastAspect = lastViewWidth / lastViewHeight;

    viewHeight.value = eval(viewHeight.value);

    if (viewAspectFixed.checked) {
        viewWidth.value = (parseInt(viewHeight.value) * lastAspect).toString();
    }

    updateCanvas();
};

import { basicSetup } from "codemirror"
import { EditorView } from "@codemirror/view"

const view = new EditorView({
    doc: templateCode,
    parent: document.querySelector<HTMLDivElement>("#editor")!,
    extensions: [basicSetup]
})

updateCanvas();
