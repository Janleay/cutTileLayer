<template>
  <div class="formBox">
    <div class="form" ref="form">
      <div class="formItem">
        <div class="name">开挖深度:</div>
        <div class="value">
          <a-input-number style="width: 60% !important;" :precision="2" placeholder="请输入深度" v-model="depth" />米
        </div>
      </div>
      <div class="formItem">
        <div class="name">开挖挖方:</div>
        <div class="value">
          <a-input-number style="width: 60% !important;" :precision="2" disabled="disabled" placeholder="请输入深度" v-model="volumn" />立方米
        </div>
      </div>
      <div class="formItem">
        <div class="name">开挖面积:</div>
        <div class="value">
          <a-input-number style="width: 60% !important;" :precision="3" disabled="disabled" placeholder="请输入深度" v-model="area" />平方千米
        </div>
      </div>
      <div class="formItem">
        <div class="name">开挖形状:</div>
        <div class="value">
          <a-radio-group v-model="action">
            <a-radio :value="item" :key="index" v-for="(item, index) in ['多边形','圆形','矩形']">
              {{ item }}
            </a-radio>
          </a-radio-group>
        </div>
      </div>
    </div>
    <div class="btnGroup">
      <a-button title="清除" class="btn btn-1" @click="handleClear"><img :src="require('@/assets/img/map/重置.png')" />清除</a-button>
      <a-button title="绘制" class="btn btn-1" @click="handleAction"><img :src="require('@/assets/img/map/绘制.png')" />绘制</a-button>
      <a-button title="开挖" class="btn" type="primary" @click="handleCut(depth)">开挖</a-button>
      <a-button title="动态" class="btn" type="primary" @click="handleCutUpdate">动态模拟</a-button>
    </div>
    <ResultList
      ref="cut"
      :plusHeight="24"
      :result="result"
      :featTotal="featTotal"
      @handleSearch="handleSearch"
      @handleOpenDetail="detail => handleOpenDetail3D(detail)"
    />
  </div>
</template>

<script>
import { CutTileLayerFactory } from '@/views/gis/map3D/components/analysis/cut/CutTileLayer'
import { CutBasemapTileLayer } from '@/views/gis/map3D/components/analysis/cut/CutBasemapTileLayer'
import ResultList from '@/views/gis/map/components/search/resultList.vue'
import { cut } from '@/api/business/analysis'
import mapUtil from '@/views/gis/components/mapUtil'
import layerUtil from '@/views/gis/map/mixin/layerUtil'
import highlight3D, { symbol3D } from '@/views/gis/map3D/components/analysis/cut/highlight3D'
import { getArcgis } from 'fzis-map-components/src/components/util'

export default {
  mixins: [mapUtil, layerUtil, highlight3D],
  components: { ResultList },
  data () {
    return {
      action: '多边形',
      depth: 10,
      dDepth: 0.5, // 默认动态开挖深度 0.5m
      volumn: 0,
      area: 0,
      cutGeometries: [],
      sketchViewModel: null,
      minHeight: 9999,
      interval: null,
      result: { total: 0, ptNum: 0, plNum: 0, pgNum: 0, records: [] },
      featTotal: { ptNum: 0, plNum: 0, pgNum: 0 },
      list: []
    }
  },
  beforeDestroy () {
    this.handleClear()
    const { sketchLayer, meshLayer, arcgis: { view } } = this
    if (sketchLayer) {
      sketchLayer.removeAll()
      view.map.remove(sketchLayer)
    }
    if (meshLayer) {
      meshLayer.removeAll()
      view.map.remove(meshLayer)
    }
    view.highlights && view.highlights.remove('cut') && view.highlights.remove('highlight')
  },
  mounted () {
    this.$nextTick(() => {
      this.init()
    })
  },
  methods: {
    init () {
      this.arcgis = window.arcgisUtil.getArcgis()
      const { arcgis, arcgis: { view } } = this
      arcgis.esriLoader('GraphicsLayer', 'esri/widgets/Sketch/SketchViewModel').then(esri => {
        // 初始化绘制图层
        !this.sketchLayer && (this.sketchLayer = new esri.GraphicsLayer({
          elevationInfo: {
            mode: 'absolute-height'
          }
        }))
        this.sketchLayer.removeAll()
        // 初始化侧面mesh图层
        !this.meshLayer && (this.meshLayer = new esri.GraphicsLayer())
        this.meshLayer.removeAll()
        view.map.addMany([this.sketchLayer, this.meshLayer])
        // 初始化绘制工具
        this.sketchViewModel = new esri.SketchViewModel({
          layer: this.sketchLayer,
          defaultUpdateOptions: {
            tool: 'reshape',
            toggleToolOnClick: false
          },
          view: view
        })
        this.sketchViewModel.on('create', async event => {
          if (event.state === 'complete') {
            const graphic = event.graphic
            graphic.elevationInfo = {
              mode: 'on-the-ground'
            }
            this.sketchLayer.add(graphic)
            this.volumn = 0
            this.area = 0
            const sketchGeometry = event.graphic.geometry
            this.cutGeometries.push(sketchGeometry)
          }
        })
        // 增加开挖分析的高亮样式
        view.highlights && view.highlights.add(symbol3D.cut.polyline)
        view.highlights && view.highlights.add(symbol3D.highlight.polyline)
      })
    },
    splitGeometry (cutGeometry, currentDepth = this.depth) {
      const { arcgis, arcgis: { view, config: { spatialReference } } } = this
      arcgis.esriLoader('geometryEngine', 'Graphic').then(esri => {
        this.area = esri.geometryEngine.planarArea(cutGeometry, 'square-kilometers')
        const divideLevel = 20
        const queryPolyline = new esri.Graphic({
          geometry: {
            type: 'polyline',
            paths: cutGeometry.rings,
            spatialReference: spatialReference
          }
        })
        // 地形
        const elevationLayer = view.map.ground.layers.getItemAt(0)

        if (elevationLayer !== undefined) {
          elevationLayer.queryElevation(queryPolyline.geometry).then(result1 => {
            const extentRings = this.getExtentGeometryRings(result1.geometry, cutGeometry)
            const lonOffset = (extentRings[2][0] - extentRings[0][0]) / (divideLevel - 1)
            const latOffset = (extentRings[0][1] - extentRings[1][1]) / (divideLevel - 1)
            const rings1 = []
            for (let x = 0; x < divideLevel; x++) {
              for (let y = 0; y < divideLevel; y++) {
                rings1.push([extentRings[0][0] + lonOffset * x, extentRings[0][1] - latOffset * y])
              }
            }
            const polyline = new esri.Graphic({
              geometry: {
                type: 'polyline', // autocasts as new Polyline()
                paths: rings1,
                spatialReference: spatialReference
              }
            })
            elevationLayer.queryElevation(polyline.geometry).then(result => {
              const paths = result.geometry.paths[0]
              const len = paths.length
              let currentVolumn = 0
              for (let i = 0; i < len - divideLevel - 1; i++) {
                if ((i + 1) % divideLevel === 0) continue
                const rings = [
                  [paths[i][0], paths[i][1]],
                  [paths[i + 1][0], paths[i + 1][1]],
                  [paths[i + 1 + divideLevel][0], paths[i + 1 + divideLevel][1]],
                  [paths[i + divideLevel][0], paths[i + divideLevel][1]]
                ]
                const height = (paths[i][2] + paths[i + 1][2] + paths[i + 1 + divideLevel][2] + paths[i + divideLevel][2]) / 4
                const polygon = new esri.Graphic({
                  geometry: {
                    type: 'polygon', // autocasts as new Polygon()
                    rings: [rings],
                    hasZ: false,
                    spatialReference: spatialReference
                  }
                })
                const resGeometry = esri.geometryEngine.intersect(polygon.geometry, cutGeometry)
                if (resGeometry !== undefined && !!resGeometry) {
                  const area = esri.geometryEngine.planarArea(resGeometry, 'square-meters')
                  if ((height - this.minHeight + currentDepth) > 0) {
                    currentVolumn += (height - this.minHeight + currentDepth) * area
                  }
                }
              }
              this.volumn = currentVolumn
            })
          })
        }
      })
    },
    getExtentGeometryRings (heightGeometry, geometry) {
      const heightRings = heightGeometry.paths[0]
      const rings = geometry.rings[0]
      let minLon = rings[0][0]
      let minLat = rings[0][1]
      let maxLon = rings[0][0]
      let maxLat = rings[0][1]
      this.minheight = heightRings[0][2]
      for (let i = 1; i < rings.length; i++) {
        if (rings[i][0] > maxLon) {
          maxLon = rings[i][0]
        } else if (rings[i][0] < minLon) {
          minLon = rings[i][0]
        }
        if (rings[i][1] > maxLat) {
          maxLat = rings[i][1]
        } else if (rings[i][1] < minLat) {
          minLat = rings[i][1]
        }
        if (heightRings[i][2] < this.minHeight) {
          this.minHeight = heightRings[i][2]
        }
      }
      return [
        [minLon, maxLat],
        [minLon, minLat],
        [maxLon, minLat],
        [maxLon, maxLat]
      ]
    },
    handleAction () {
      const type = { 多边形: 'polygon', 圆形: 'circle', 矩形: 'rectangle' }[this.action]
      if (this.sketchViewModel) {
        this.handleClear()
        this.sketchViewModel.create(type)
      }
    },
    async handleCut (depth) {
      const { arcgis: { view }, cutGeometries, meshLayer,
        cutLayer1, cutLayer2, cutBaseLayer1, cutBaseLayer2,
        sketchViewModel, sketchLayer
      } = this
      if (cutGeometries.length === 0) {
        this.$message.warning('请先绘制几何')
        return false
      }
      const elevationLayer = view.map.ground.layers.getItemAt(0)
      const canvas = document.createElement('canvas')
      canvas.id = 'canvas'
      cutLayer2 && view.map.ground.layers.remove(cutLayer2)
      if (cutLayer1) {
        this.cutLayer2 = cutLayer1
      }
      cutBaseLayer2 && view.map.remove(cutBaseLayer2)
      if (cutBaseLayer1) {
        this.cutBaseLayer2 = cutBaseLayer1
      }
      this.cutLayer1 = await CutTileLayerFactory.create({
        title: 'cut切片图层',
        cutGeometries: cutGeometries,
        view: view,
        meshGraLayer: meshLayer, // 设置围边图层
        depth: depth * -1,
        canvas,
        elevationLayer
      })
      view.map.ground.layers.add(this.cutLayer1)
      // 设置底面
      this.cutBaseLayer1 = await CutBasemapTileLayer.create({
        cutGeometries: cutGeometries,
        view: view
      })
      view.map.add(this.cutBaseLayer1)
      // 设置围边
      // this.cutLayer.setMesh()
      // 清除绘制面
      sketchViewModel && sketchViewModel.cancel()
      sketchLayer && sketchLayer.removeAll()
      // 计算开挖体积和面积
      cutGeometries.forEach(cutGeometry => {
        this.splitGeometry(cutGeometry, depth)
      })
      await this.getCut(depth, cutGeometries)
      return true
    },
    handleClear () {
      const { cutLayer1, cutLayer2, meshLayer, sketchViewModel, sketchLayer, cutBaseLayer1, cutBaseLayer2,
        arcgis: { view }, interval } = this
      for (const layer of [cutLayer1, cutLayer2]) {
        layer && view.map.ground.layers.remove(layer)
        this[layer] = null
      }
      for (const layer of [cutBaseLayer1, cutBaseLayer2]) {
        layer && view.map.remove(layer)
        this[layer] = null
      }
      sketchViewModel && sketchViewModel.cancel()
      sketchLayer && sketchLayer.removeAll()
      meshLayer && meshLayer.removeAll()
      interval && clearInterval(interval)
      this.cutGeometries = []
      this.area = 0
      this.volumn = 0
      this.clearHighlights()
    },
    handleCutUpdate () {
      const { depth, cutBaseLayer2, arcgis: { view }, dDepth } = this
      let currentDepth = 0
      // const dDepth = depth / 20.0
      const interval = setInterval(async () => {
        currentDepth += dDepth
        if (depth <= currentDepth) {
          await this.handleCut(depth)
          cutBaseLayer2 && view.map.remove(cutBaseLayer2)
          interval && clearInterval(interval)
        } else {
          const cutState = await this.handleCut(currentDepth)
          if (cutState === false) {
            cutBaseLayer2 && view.map.remove(cutBaseLayer2)
            interval && clearInterval(interval)
          }
        }
      }, 1000)
    },
    async getCut (depth, cutGeometries) {
      if (depth === this.depth) {
        const graphic = { geometry: cutGeometries[0] }
        const wkt = await this.coordToWkt(graphic)
        cut({ wkt, depth }).then(list => {
          this.list = list
          const pt = list.filter(v => v.geotype === 1)
          const pl = list.filter(v => v.geotype === 2)
          const pg = list.filter(v => v.geotype === 3)
          this.result = { total: list.length, records: list.slice(0, 10) }
          this.featTotal = { ptNum: pt.length, plNum: pl.length, pgNum: pg.length }
          // 高亮显示返回结果
          this.addHighlight(list)
        })
      }
    },
    handleSearch (current, size, options = {}) {
      let records = []
      switch (options.geotype) {
        case 1:
          records = this.list.filter(v => v.geotype === 1)
          break
        case 2:
          records = this.list.filter(v => v.geotype === 2)
          break
        case 3:
          records = this.list.filter(v => v.geotype === 3)
          break
        default:
          records = this.list
          break
      }
      this.result.records = records.slice((current - 1) * size, current * size)
      this.result.total = records.length
    },
    async handleOpenDetail3D (detail) {
      // 高亮定位三维对象
      const { layer: { id }, attrs: { bm, shape } } = detail
      // 获取三维图层
      const layer3D = this.layerList3D.find(v => {
        if (!v.relationLayerId) return false
        const relationLayerIds = v.relationLayerId
        if (!relationLayerIds || relationLayerIds.length === 0) return false
        return relationLayerIds.includes(id)
      })
      if (!layer3D) {
        this.$message.warning('未找到关联的三维图层。')
        return false
      }
      getArcgis().then(async arcgis => {
        const { view } = arcgis
        // const highlightTempLayer = view.map.findLayerById('1984184455996149761_1')
        const target = await this.convertFromWKT(shape)
        view.goTo({ target, zoom: 10 }, { animate: false }).then(() => {
          const highlightTempLayer = view.map.findLayerById(layer3D.id + '_1')
          if (highlightTempLayer) {
            this.highlight3D(bm, highlightTempLayer, 'detail', false)
          }
        })
      })
      // 打开详情窗
      this.$emit('handleOpenDetail', { ...detail, location: false })
    },
    async addHighlight (list) {
      // 获取二维、三维图层
      const { layerList2D, layerList3D } = await this.getMapLayerList({
        applicationId2D: '1943191750977818626',
        applicationId3D: '1940948710213062657'
      })
      this.layerList2D = layerList2D.filter(v => v.dataSetInfos && v.dataSetInfos.tableName)
      this.layerList3D = layerList3D
      const feats = []
      for (let i = 0; i < layerList3D.length; i++) {
        if (!layerList3D[i].relationLayerId) continue
        const relationLayerIds = layerList3D[i].relationLayerId
        if (!relationLayerIds || relationLayerIds.length === 0) continue
        const layer2Ds = this.layerList2D.filter(v => relationLayerIds.includes(v.id))
        if (!layer2Ds || layer2Ds.length === 0) continue
        const bms = list.filter(p => layer2Ds.map(v => v.dataSetInfos.tableName).indexOf(p.tableName) !== -1).map(v => v.bm)
        bms && bms.length > 0 && feats.push({ bms: bms, layer3D: layerList3D[i] })
      }
      const { view } = await getArcgis()
      view.goTo({ target: this.cutGeometries }, { animate: false }).then(() => {
        this.highlightMultiple3DS(feats, null, 'cut')
      })
    }
  }
}
</script>

<style scoped lang="less">
@import '~@/views/gis/map/components/search/index.less';
.formBox {
  .btnGroup {
    display: flex;justify-content: space-between;padding-left: 0;
    .btn {
      padding: 0 16px;
    }
  }
}
</style>
