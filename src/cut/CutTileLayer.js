// 开挖分析

export class CutTileLayerFactory {
  static async create (properties) {
    const arcgis = window.arcgisUtil.getArcgis()
    const { BaseElevationLayer, geometryEngine, Polyline, Mesh, Graphic } =
      await arcgis.esriLoader('BaseElevationLayer', 'geometryEngine', 'Polyline', 'Mesh', 'Graphic')
    const CutTileLayerClass = BaseElevationLayer.createSubclass({
      constructor: function (properties) {
        this.cutGeometries = properties.cutGeometries
        this.view = properties.view
        this.depth = properties.depth
        this.meshGraLayer = properties.meshGraLayer
        this.sideHref = properties.sideHref
        this.sideColor = properties.sideColor || '#AAAAAA'
        this.canvas = properties.canvas
        this.elevationLayer = properties.elevationLayer
        this.groundTerrain = properties.groundTerrain || true
      },
      load: function (signal) {
        const defaultElevation = this.view.map.ground.layers.getItemAt(0)
        const promise = defaultElevation.load(signal).then(() => {
          this.tileInfo = defaultElevation.tileInfo
          this.spatialReference = defaultElevation.spatialReference
          this.fullExtent = defaultElevation.fullExtent
        })
        return this.addResolvingPromise(promise)
      },
      setMesh: function () {
        if (this.meshGraLayer) {
          this.setSideMesh()
        }
      },
      setSideMesh: async function () {
        // 构建mesh点
        const materialSymbol = this.sideHref ? {
          type: 'mesh-3d',
          symbolLayers: [{
            type: 'fill',
            material: {
              href: this.sideHref
            }
          }]
        } : {
          type: 'mesh-3d',
          symbolLayers: [{
            type: 'fill',
            material: {
              color: this.sideColor
            }
          }]
        }
        const graphics = []
        for (let i = 0; i < this.cutGeometries.length; i++) {
          const cutGeometry = this.cutGeometries[i]
          // const cutGeometryBuffer = geometryEngine.buffer(cutGeometry, -0.5, 'meters')
          // const topSurfaceGraphic = await this.createTopSurfaceMesh(cutGeometry);
          // graphics.push(topSurfaceGraphic);
          const vertexPosition = []
          const _rings = []
          for (let j = 0; j < cutGeometry.rings.length; j++) {
            const ring = cutGeometry.rings[j]
            if (this.view.map.ground.layers.items.length > 0) {
              const line = new Polyline({
                hasZ: true,
                paths: [ring],
                spatialReference: this.view.spatialReference
              })
              const desGeo = geometryEngine.densify(line, 10)
              const res = await this.elevationLayer.queryElevation(desGeo)
              res.geometry.paths && res.geometry.paths[0].forEach((element) => {
                vertexPosition.push(element[0], element[1], element[2] + this.depth)
                vertexPosition.push(element[0], element[1], element[2])
                _rings.push([element[0], element[1], element[2] + this.depth])
              })
            } else {
              ring.forEach((element) => {
                vertexPosition.push(element[0], element[1], this.depth)
                vertexPosition.push(element[0], element[1], 0)
                _rings.push([element[0], element[1], this.depth])
              })
            }
          }
          const sideNum = (vertexPosition.length) / 6 - 1
          const faces = []
          for (let k = 0; k < sideNum * 2; k++) {
            faces.push(k)
            faces.push(k + 1)
            faces.push(k + 2)
          }
          const mesh = new Mesh({
            spatialReference: this.view.spatialReference,
            vertexAttributes: {
              position: vertexPosition
            },
            components: [
              {
                faces: faces
              }
            ]
          })
          const graphic = new Graphic({
            geometry: mesh,
            symbol: materialSymbol
          })
          graphics.push(graphic)
        }
        this.meshGraLayer.graphics.addMany(graphics)
      },
      getGrid: function (geometry, extent, level) {
        const coords = []
        geometry.rings.forEach((ring) => {
          ring.forEach((element) => {
            const x = (element[0] - extent.xmin) / this.tileInfo.lods[level].resolution
            const y = (extent.ymax - element[1]) / this.tileInfo.lods[level].resolution
            coords.push([x, y])
          })
        })
        return coords
      },
      // Fetches the tile(s) visible in the view
      fetchTile: async function (level, row, col, options) {
        // 瓦片级别大于等于11级数据为空，所以不进行挖洞操作，不然会出现不可预想的后果
        if (level >= 11) return false
        const tilePromises = await this.elevationLayer.fetchTile(level, row, col, options)
        const { width, height } = tilePromises
        const { canvas, depth } = this
        const [xmin, ymin, xmax, ymax] = this.getTileBounds(level, row, col)
        const noDataValue = options.noDataValue || 3.4028234663852886e37
        const data = {
          width: width,
          height: height,
          values: new Array(width * height).fill(noDataValue),
          noDataValue: noDataValue,
          maxZError: 0
        }
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', {
          willReadFrequently: true
        })
        ctx.clearRect(0, 0, width, height)
        ctx.fillStyle = 'white'
        ctx.fillRect(0, 0, width, height)
        // const zmin = -100;
        const dx = width / (xmax - xmin)
        const dy = height / (ymax - ymin)
        this.cutGeometries.forEach((cutGeometry) => {
          const area = cutGeometry
          if (!area) return data
          area.rings.forEach(function (ring) {
            ctx.fillStyle = 'black'
            ctx.strokeStyle = 'black'
            ctx.lineWidth = 0
            ctx.beginPath()
            if (ring && ring.length > 2) {
              ring.forEach(function (v, index) {
                const x = (v[0] - xmin) * dx
                const y = (ymax - v[1]) * dy
                if (index === 0) {
                  ctx.moveTo(x, y)
                } else {
                  ctx.lineTo(x, y)
                }
              })
            }
            ctx.closePath()
            ctx.fill()
            ctx.stroke()
          })
          const imageData = ctx.getImageData(0, 0, width, height)
          const pixels = imageData.data
          for (let i = 0; i < data.values.length; i++) {
            const red = pixels[i * 4]
            if (red < 100) {
              // data.values[i] = noDataValue;
              data.values[i] = tilePromises.values[i] + depth
              // data.values[i] = zmin || -100;
            }
          }
        })
        options.signal.throwIfAborted()
        return data
      }
    })
    return new CutTileLayerClass(properties)
  }
}
