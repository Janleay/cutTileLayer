import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer";
import {Point, Polygon, Polyline} from "@arcgis/core/geometry";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import * as meshUtils from "@arcgis/core/geometry/support/meshUtils";
import Mesh from "@arcgis/core/geometry/Mesh";
import Graphic from "@arcgis/core/Graphic";
import Extent from "@arcgis/core/geometry/Extent";
import * as promiseUtils from "@arcgis/core/core/promiseUtils";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import BaseElevationLayer from "@arcgis/core/layers/BaseElevationLayer";
import * as THREE from 'three';

export const CutTileLayer = BaseElevationLayer.createSubclass({
    // exaggerates the actual elevations by 70x
    exaggeration: 70,
    constructor: function (a) {
        // super(a)
        this.cutGeometries=a.cutGeometries;
        this.view= a.view;
        this.depth= a.depth;
        this.meshGraLayer= a.meshGraLayer;
        this.sideHref= a.sideHref;
        this.sideColor= '#AAAAAA';
        this.baseColor= '#AAAAAA';
        this.groundTerrain= a.groundTerrain;
        this.canvas=a.canvas
        this.elevationLayer = a.elevationLayer;
    },
    load: function (signal) {
        const defaultElevation = this.view.map.ground.layers.getItemAt(0);
        const promise = defaultElevation.load(signal).then(() => {
            this.tileInfo = defaultElevation.tileInfo;
            this.spatialReference = defaultElevation.spatialReference;
        });
        // this.fullExtent = this.area.extent;
        return this.addResolvingPromise(promise);
    },

    setMesh() {
        if (this.meshGraLayer) {
            console.log(111)
            this.setSideMesh()
        }
    },
    async setSideMesh() {
        //构建mesh点
        let materialSymbol = this.sideHref ? {
            type: "mesh-3d",
            symbolLayers: [{
                type: "fill",
                material: {
                    href: this.sideHref
                }
            }]
        } : {
            type: "mesh-3d",
            symbolLayers: [{
                type: "fill",
                material: {
                    color: this.sideColor
                }
            }]
        }
        let graphics = [];
        let baseMesh_geo = null;
        for (let i = 0; i < this.cutGeometries.length; i++) {
            let cutGeometry = this.cutGeometries[i];
            let cutGeometryBuffer = geometryEngine.buffer(cutGeometry, -0.5, "meters")
            // const topSurfaceGraphic = await this.createTopSurfaceMesh(cutGeometry);
            // graphics.push(topSurfaceGraphic);
            let vertexPosition = [];
            let _rings = [];
            for (let j = 0; j < cutGeometryBuffer.rings.length; j++) {
                let ring = cutGeometryBuffer.rings[j];
                if (this.view.map.ground.layers.items.length > 0) {
                    const line = new Polyline({
                        hasZ: true,
                        paths: [ring],
                        spatialReference: this.view.spatialReference,
                    });
                    const desGeo = geometryEngine.densify(line, 10);
                    let hLayer = this.view.map.ground.layers.items[0];
                    let res = await hLayer.queryElevation(desGeo);
                    //底面地形效果
                    if (this.groundTerrain) {
                        baseMesh_geo = await meshUtils.createFromElevation(hLayer, cutGeometryBuffer.extent, {
                            demResolution: 120
                        });
                        const vPositions = baseMesh_geo.vertexAttributes.position;
                        let vColors = [];
                        //挖掉高度
                        for (let index = 0; index < vPositions.length; index += 3) {
                            vPositions[index + 2] = vPositions[index + 2] + this.depth;
                            //底面效果
                            //判断点是否在面的范围内
                            let bool = cutGeometryBuffer.contains(new Point({
                                x: vPositions[index], y: vPositions[index + 1], z: vPositions[index + 2], spatialReference: this.view.spatialReference
                            }))
                            if (!bool) {
                                vColors.push(0, 0, 0, 0);
                            } else {
                                vColors.push(110, 90, 80, 240);
                            }
                            baseMesh_geo.vertexAttributes.color = vColors;
                        }
                    }
                    res.geometry.paths && res.geometry.paths[0].forEach((element) => {
                        vertexPosition.push(element[0], element[1], element[2] + this.depth)
                        vertexPosition.push(element[0], element[1], element[2])
                        _rings.push([element[0], element[1], element[2] + this.depth])
                    });
                } else {
                    ring.forEach((element) => {
                        vertexPosition.push(element[0], element[1], this.depth)
                        vertexPosition.push(element[0], element[1], 0)
                        _rings.push([element[0], element[1], this.depth])
                    });
                }
            }
            let sideNum = (vertexPosition.length) / 6 - 1;
            let faces = [];
            for (let k = 0; k < sideNum * 2; k++) {
                faces.push(k)
                faces.push(k + 1)
                faces.push(k + 2)
            }
            let mesh = new Mesh({
                spatialReference: this.view.spatialReference,
                vertexAttributes: {
                    position: vertexPosition
                },
                components: [
                    {
                        faces: faces
                    }
                ],
            });
            let graphic = new Graphic({
                geometry: mesh,
                symbol: materialSymbol
            });
            graphics.push(graphic)

            //底面
            let base_mesh = Mesh.createFromPolygon(new Polygon({
                type: 'polygon',
                rings: [_rings],
                spatialReference: this.view.spatialReference
            }))
            base_mesh.components[0].shading = "smooth";
            let graphic_base = new Graphic({
                geometry: this.groundTerrain ? baseMesh_geo : {
                    type: 'polygon',
                    rings: [_rings],
                    spatialReference: this.view.spatialReference
                },
                hasZ: true,
                symbol: this.groundTerrain ? {
                    type: "mesh-3d",
                    symbolLayers: [{ type: "fill" }]
                } : {
                    type: 'simple-fill',
                    color: '#aaaaaa',
                    style: 'solid',
                    outline: {
                        color: [110, 90, 80, 1],
                        width: 2
                    }
                }
            })
            // graphics.push(graphic_base)
        }
        this.meshGraLayer.graphics.addMany(graphics);
    },
    getGrid(geometry, extent, level) {
        let coords = [];
        geometry.rings.forEach((ring) => {
            ring.forEach((element) => {
                let x = (element[0] - extent.xmin) / this.tileInfo.lods[level].resolution;
                let y = (extent.ymax - element[1]) / this.tileInfo.lods[level].resolution;
                coords.push([x, y]);
            });
        })
        return coords;
    },

    // 在 fetchTile 中获取 intersect 后调用此方法
    samplePointsInPolygon(cutGeometry, extent, resolution, padding = 0) {
        const points = [];

        // 获取 polygon 的包围盒
        const xmin = cutGeometry.extent.xmin - padding;
        const ymin = cutGeometry.extent.ymin - padding;
        const xmax = cutGeometry.extent.xmax + padding;
        const ymax = cutGeometry.extent.ymax + padding;

        // 按分辨率生成点阵
        for (let x = xmin; x <= xmax; x += resolution) {
            for (let y = ymin; y <= ymax; y += resolution) {
                const point = new Point({ x: x, y: y, spatialReference: cutGeometry.spatialReference });

                if (geometryEngine.contains(cutGeometry, point)) {
                    let xPixel = (x - extent.xmin) / resolution;
                    let yPixel = (extent.ymax - y) / resolution;
                    points.push([xPixel, yPixel]);
                }
            }
        }

        return points;
    },

// Fetches the tile(s) visible in the view
    async fetchTile (level, row, col, options) {
        const tilePromises = await this.elevationLayer.fetchTile(level, row, col, options)
        const { canvas, depth } = this
        const [xmin, ymin, xmax, ymax] = this.getTileBounds(level, row, col);

        const noDataValue = options.noDataValue || 3.4028234663852886e37;

        const height = 257;
        const width = 257;
        const data = {
            width: width,
            height: height,
            values: new Array(width * height).fill(noDataValue),
            noDataValue: noDataValue,
            maxZError: 0
        };
        const ctx = canvas.getContext("2d", {
            willReadFrequently: true
        });
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, width, height);
        // const zmin = -100;
        const dx = width / (xmax - xmin);
        const dy = height / (ymax - ymin);
        this.cutGeometries.forEach((cutGeometry) => {
            const area = cutGeometry;
            const zmin = area.extent.zmin;
            if (!area) return data
            area.rings.forEach(function(ring) {
                ctx.fillStyle = "black";
                ctx.strokeStyle = "black";
                ctx.lineWidth = 0;
                ctx.beginPath();
                if (2 < ring.length) {
                    ring.forEach(function(v, index) {
                        const x = (v[0] - xmin) * dx;
                        const y = (ymax - v[1]) * dy;
                        if (0 === index) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    });
                }
                ctx.closePath();
                ctx.fill();
                ctx.stroke();
            });
            const imageData = ctx.getImageData(0, 0, width, height);
            // console.log(111, imageData)
            const pixels = imageData.data;
            for (let i = 0; i < data.values.length; i++) {
                const red = pixels[i * 4];
                if (red < 100) {
                    // data.values[i] = noDataValue;
                    data.values[i] = tilePromises.values[i] + depth;
                    console.log(depth)
                    // data.values[i] = zmin || -100;
                }
            }
        });
        options.signal.throwIfAborted();
        // console.log(data)
        return data;
        // var lt_x =
        //     this.tileInfo.origin.x +
        //     col * this.tileInfo.lods[level].resolution * this.tileInfo.size[0];
        // var lt_y =
        //     this.tileInfo.origin.y -
        //     row * this.tileInfo.lods[level].resolution * this.tileInfo.size[1];
        // var rb_x =
        //     this.tileInfo.origin.x +
        //     (col + 1) *
        //     this.tileInfo.lods[level].resolution *
        //     this.tileInfo.size[0];
        // var rb_y =
        //     this.tileInfo.origin.y -
        //     (row + 1) *
        //     this.tileInfo.lods[level].resolution *
        //     this.tileInfo.size[1];
        //
        // return this._elevation.fetchTile(level, row, col, options).then(
        //     function (data) {
        //         const exaggeration = 1;
        //         let coordsCut = []
        //         if (this.cutGeometries.length > 0 && this.view) {
        //             let extent = new Extent({
        //                 xmin: lt_x,
        //                 ymin: rb_y,
        //                 xmax: rb_x,
        //                 ymax: lt_y,
        //                 spatialReference: this.view.spatialReference
        //             });
        //             this.cutGeometries.forEach((cutGeometry) => {
        //                 let intersect = geometryEngine.intersect(extent, cutGeometry);
        //                 if (intersect) {
        //                     // let coordsCut = this.getGrid(intersect, extent, level)
        //                     coordsCut = this.samplePointsInPolygon(cutGeometry, extent, this.tileInfo.lods[level].resolution, -10);
        //                     if (coordsCut.length > 0) {
        //                         coordsCut.forEach(coord => {
        //                             // 将地理坐标转换为像素坐标
        //                             // const pixelX = Math.floor((coord[0] - extent.xmin) / data.resolution);
        //                             // const pixelY = Math.floor((extent.ymax - coord[1]) / data.resolution);
        //                             const pixelX = Math.floor(coord[0]);
        //                             const pixelY = Math.floor(coord[1]);
        //                             // 确保像素坐标在数组范围内
        //                             if (
        //                                 pixelX >= 0 &&
        //                                 pixelX < data.width &&
        //                                 pixelY >= 0 &&
        //                                 pixelY < data.height
        //                             ) {
        //                                 const index = pixelY * data.width + pixelX;
        //                                 // 修改对应的高程值（例如乘以夸张系数）
        //                                 if (data.values[index] !== undefined) {
        //                                     data.values[index] = data.noDataValue;
        //                                     // data.values[index] = data.values[index] + this.depth;
        //                                 }
        //                             }
        //                         });
        //                     }
        //                 }
        //             })
        //         }
        //         // for (let i = 0; i < data.values.length; i++) {
        //         //     data.values[i] = data.values[i] * exaggeration;
        //         //     // data.values[i] = data.values[i] * exaggeration;
        //         // }
        //         console.log(data)
        //         return data;
        //     }.bind(this),
        // );
    },
});