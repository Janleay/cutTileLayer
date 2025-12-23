import { getArcgis } from 'fzis-map-components/src/components/util'

export const symbol3D = {
  cut: {
    polyline: {
      name: 'cut',
      color: 'rgb(4,251,251)',
      haloOpacity: 0.6,
      fillOpacity: 0.5
    }
  },
  highlight: {
    polyline: {
      name: 'detail',
      color: 'rgb(4,251,251)',
      haloOpacity: 1,
      fillOpacity: 0.8
    }
  }
}

export default {
  methods: {
    highlightMultiple3DS (d, geometry, highlightName = false, goto = false, callback) {
      this.clearHighlights()
      getArcgis().then(arcgis => {
        const { view } = arcgis
        arcgis.esriLoader('SceneLayer', 'SceneFilter').then(esri => {
          // 移除高亮
          if (this.highlightItems) {
            this.highlightItems.remove()
          }
          d.forEach(v => {
            const { bms, layer3D: { url, layerUrl, id } } = v
            const bmValues = bms.map(bm => {
              // 如果是字符串，添加引号
              if (typeof bm === 'string') {
                return `'${bm}'`
              }
              return bm
            })
            const sceneLayer = new esri.SceneLayer({
              url: layerUrl || url,
              id: id + '_1',
              // definitionExpression: "BM in ('ZH322337900001')",
              definitionExpression: 'BM in (' + bmValues.join(',') + ')',
              outFields: ['BM']
            })
            if (geometry) {
              // 添加过滤器只支持arcgis api for js 4.34版本以及之后，目前spatialRelationship： contains或disjoint
              sceneLayer.filter = new esri.SceneFilter({ geometries: [geometry], spatialRelationship: 'contains' })
            }
            this.sceneLayerTemps.push(sceneLayer)
            view.map.add(sceneLayer)
            view.whenLayerView(sceneLayer).then(sceneLayerView => {
              // 使用 when() 方法等待图层就绪
              sceneLayerView.when(() => {
                // console.log('图层视图已就绪')
                this.executeQuery(view, sceneLayerView, highlightName, goto)
              }).catch(error => {
                console.error('图层视图初始化失败:', error)
              })
              let hasExecuted = false
              sceneLayerView.watch('updating', (updating) => {
                // console.log('图层更新中...')
                if (!updating && !hasExecuted) {
                  // console.log('图层更新完成')
                  hasExecuted = true
                  this.executeQuery(view, sceneLayerView, highlightName, goto)
                }
              })
            })
          })
        })
      })
    },
    async executeQuery (view, sceneLayerView, highlightName = false, goto = false) {
      const query = sceneLayerView.createQuery()
      query.where = '1=1'
      query.outFields = ['BM', 'OBJECTID']
      sceneLayerView.queryFeatures(query).then(res => {
        const { features } = res
        // console.log('查询结果数量:', features.length)
        if (!features || !features.length) {
          return false
        }
        if (highlightName) {
          this.highlightItems = sceneLayerView.highlight(features, { name: highlightName })
        } else {
          this.highlightItems = sceneLayerView.highlight(features)
        }
        if (goto) {
          view.goTo({ target: features, zoom: 10 })
        }
        // sceneLayer.visible = false
        // console.log('查询结果:', features)
      }).catch(error => {
        console.error('查询出错:', error)
      })
    },
    clearHighlights () {
      getArcgis().then(arcgis => {
        const { view } = arcgis
        if (this.highlightItems) {
          this.highlightItems.remove()
        }
        if (this.sceneLayerTemps && this.sceneLayerTemps.length) {
          view.map.removeMany(this.sceneLayerTemps)
        }
        this.sceneLayerTemps = []
        if (this.highlightItem) {
          this.highlightItem.remove()
        }
      })
    },
    highlight3D (bm, layer, highlightName = false, goto = true, callback) {
      console.log(1111)
      getArcgis().then(arcgis => {
        const { view } = arcgis
        view.whenLayerView(layer).then(sceneLayerView => {
          const query = sceneLayerView.createQuery()
          query.where = '1=1'
          query.outFields = ['BM', 'OBJECTID']
          sceneLayerView.queryFeatures(query).then(res => {
            const { features } = res
            const feats = features.filter(v => v.attributes.BM === bm)
            if (!feats || !feats.length) {
              return false
            }
            // 高亮
            if (this.highlightItem) {
              this.highlightItem.remove()
            }
            if (highlightName) {
              this.highlightItem = sceneLayerView.highlight(feats, { name: highlightName })
            } else {
              this.highlightItem = sceneLayerView.highlight(feats)
            }
            if (goto) {
              view.goTo({
                target: feats,
                zoom: 3
              })
            }
            // sceneLayer.visible = false
            // console.log('查询结果:', features)
          }).catch(error => {
            console.error('查询出错:', error)
          })
        })
      })
    }
  }
}
