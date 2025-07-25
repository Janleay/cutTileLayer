// CutBaseTileLayer.js
import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer";
import Extent from "@arcgis/core/geometry/Extent";
import { intersect as geometryEngineIntersect  } from "@arcgis/core/geometry/geometryEngine";

const CutBaseTileLayer = BaseTileLayer.createSubclass({
    constructor: function (properties) {
        console.log("Is instance of BaseTileLayer:", this instanceof BaseTileLayer);
        this.cutGeometries = properties.cutGeometries || [];
        this.view = properties.view;
    },

    load: function (signal) {
        const defaultElevation = this.view.map.ground.layers.getItemAt(0);
        const loadPromise = defaultElevation.load(signal).then(() => {
            this.tileInfo = defaultElevation.tileInfo;
            this.spatialReference = defaultElevation.spatialReference;
            this.fullExtent = defaultElevation.fullExtent;
            this.tilingScheme = defaultElevation.tilingScheme;
        });
        return this.addResolvingPromise(loadPromise);
    },

    fetchTile: function (level, row, col, options) {
        const [xmin, ymin, xmax, ymax] = this.getTileBounds(level, row, col);
        const width = 256;
        const height = 256;

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");

        const extent = new Extent({
            xmin,
            ymin,
            xmax,
            ymax,
            spatialReference: this.view.spatialReference
        });

        // ✅ 填充背景
        context.fillStyle = "rgba(224,224,224,0)";
        context.fillRect(0, 0, width, height);

        // 🔺 绘制切割区域
        this.cutGeometries.forEach((geometry) => {
            const intersection = geometryEngineIntersect(extent, geometry);
            if (intersection) {
                // const buffer = geometryEngineBuffer(intersection, 5, "meters");
                context.beginPath();
                const coords = this.getGrid(intersection, extent, level);
                context.moveTo(coords[0][0], coords[0][1]);
                for (let i = 1; i < coords.length; i++) {
                    context.lineTo(coords[i][0], coords[i][1]);
                }
                context.closePath();
                // context.fillStyle = 'rgba(110, 90, 80, 0.9)';
                context.fillStyle = "#AAAAAA";
                context.fill();
            }
        });

        options.signal.throwIfAborted();
        return canvas;
    },

    getGrid: function (geometry, extent, level) {
        const resolution = this.tileInfo.lods[level].resolution;
        return geometry.rings[0].map(point => [
            (point[0] - extent.xmin) / resolution,
            (extent.ymax - point[1]) / resolution
        ]);
    }
});

export default CutBaseTileLayer;
