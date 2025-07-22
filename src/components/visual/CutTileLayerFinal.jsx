import React from "react";
import SceneView from '@arcgis/core/views/SceneView'
import Map from '@arcgis/core/Map'
import GraphicsLayer from '@arcgis/core/layers/GraphicsLayer'
import SketchViewModel from '@arcgis/core/widgets/Sketch/SketchViewModel'
import Graphic from "@arcgis/core/Graphic";
import BaseTileLayer from "@arcgis/core/layers/BaseTileLayer";
import * as geometryEngine from "@arcgis/core/geometry/geometryEngine";
import * as CutTileLayer from "./js/CutTileLayerFinal";
import CutBaseTileLayer from "./js/CutBaseTileLayer";
import styles from './css/CutTileLayer.module.css'
import SlicePlane from "@arcgis/core/analysis/SlicePlane";
import ElevationLayer from "@arcgis/core/layers/ElevationLayer";
import SceneFilter from "@arcgis/core/layers/support/SceneFilter";
// import CutoutElevationDrawPhase from './js/webglTest'

export class ElevationExaggerationModule extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            depth: 100,     // 默认深度值
            volumn: 0       // 开挖体积
        };
        this.view = null;
        this.cutLayer = null
        this.sketchLayer = null
        this.meshLayer = null
        this.sketchViewModel = null
        this.cutGeometries = []
        this._CutTileLayer = null;
        this.divideLevel = 20;
        this.minHight = 9999;
        this.volumn = 0;
        this.elevationLayer = null;
        this.lastGrounds = [];
        this.cutBaseLayer = null
    }

    componentDidMount() {
        let that = this;
        // this._CutTileLayer = CutTileLayer
        const map = new Map({
            // basemap:'topo',
            basemap: "satellite",
            // basemap: "topo-3d",
            ground: {
                layers: [
                    new ElevationLayer({
                        url: "https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
                        // url: "//elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer"
                    })
                ],
                opacity: 1
            },
            // basemap: {
            //     baseLayers: [
            //         new VectorTileLayer({
            //             url: "https://jsapi.maps.arcgis.com/sharing/rest/content/items/75f4dfdff19e445395653121a95a85db/resources/styles/root.json",
            //         })
            //     ]
            // }
        });
        this.view = new SceneView({
            container: "viewDiv",
            map: map,
            camera: {
                position: [
                    116.39307867,
                    40.01599850,
                    135.07535
                ],
                heading: 360.00,
                tilt: 49.44
            },
            environment: {
                // lighting: {
                //     directShadowsEnabled: true
                // }
            }
            // spatialReference: {
            //     wkid: 4326
            // }
        });
        window.view = this.view;

        this.view.when(async function () {
            if (that.view.map.ground.layers.items.length > 0) {
                that.elevationLayer = that.view.map.ground.layers.items[0];
            }
        })

        that.sketchLayer = new GraphicsLayer()
        map.add(that.sketchLayer)
        that.meshLayer = new GraphicsLayer()
        map.add(that.meshLayer)
        //绘制
        that.sketchViewModel = new SketchViewModel({
            layer: that.sketchLayer,
            defaultUpdateOptions: {
                tool: 'reshape',
                toggleToolOnClick: false
            },
            view: that.view,
            defaultCreateOptions: {hasZ: false},
            polygonSymbol: {
                type: 'simple-fill',
                color: [0, 220, 0, 0.2],
                outline: {
                    width: 3,
                    style: 'dash',
                    color: [255, 128, 0, 1]
                }
            }
        })
        //绑定绘制事件
        that.sketchViewModel.on('create', event => {
            if (event.state === 'complete') {
                const graphic = event.graphic;
                graphic.elevationInfo = {
                    mode: "on-the-ground"
                };
                that.sketchLayer.add(graphic);

                that.volumn = 0;
                let sketchGeometry = event.graphic.geometry

                let area = geometryEngine.geodesicArea(sketchGeometry, "square-meters");
                // alert(area);
                that.cutGeometries.push(sketchGeometry);
                splitGeometry(sketchGeometry);
                const plane = new SlicePlane({
                    position: {
                        x: 34.0600460070941,
                        y: -117.18669237418565,
                        z: 417.75,
                    },
                    tilt: 32.62,
                    width: 29,
                    height: 29,
                    heading: 0.46,
                });
            }
        })

        // this.view.map.ground.layers.add(this.cutLayer)
        function splitGeometry(geometry) {

            const polyline = {
                type: "polyline", // autocasts as new Polyline()
                paths: geometry.rings,
                spatialReference: geometry.spatialReference
            };
            const lineSymbol = {
                type: "simple-line", // autocasts as SimpleLineSymbol()
                color: [226, 119, 40],
                width: 4
            };

            const polylineGraphic = new Graphic({
                geometry: polyline,
                symbol: lineSymbol
            });

            // let rings1 = null;

            that.elevationLayer.queryElevation(polylineGraphic.geometry).then(function (result) {
                // rings1 = result.geometry.rings[0];
                calAmountOfCut(result.geometry, geometry);
            })

        }

        function calAmountOfCutByGeometry(rings, cutGeometry, hight) {
            const polygon = {
                type: "polygon", // autocasts as new Polygon()
                rings: [rings],
                hasZ: false,
                spatialReference: {
                    wkid: 102100
                }
            };

            const fillSymbol = {
                type: "simple-fill", // autocasts as new SimpleFillSymbol()
                color: [227, 0, 0, 0.8],
                outline: {
                    // autocasts as new SimpleLineSymbol()
                    color: [255, 255, 255],
                    width: 2
                }
            };

            const polygonGraphic = new Graphic({
                geometry: polygon,
                symbol: fillSymbol
            });

            // sketchLayer.add(polygonGraphic);

            let resGeometry = geometryEngine.intersect(polygonGraphic.geometry, cutGeometry);
            if (resGeometry != undefined) {

                // let _rings =[];
                // for(let i=0;i<resGeometry.rings[0].length;i++){
                //     _rings.push([resGeometry.rings[0][i][0],
                //         resGeometry.rings[0][i][1],
                //         resGeometry.rings[0][i][2]+resGeometry.rings[0][i][3]])
                // }


                // const polygon = {
                //     type: "polygon", // autocasts as new Polygon()
                //     rings: [resGeometry],
                //     spatialReference:{
                //         wkid:102100
                //     }
                // };

                const fillSymbol = {
                    type: "simple-fill", // autocasts as new SimpleFillSymbol()
                    color: [227, 0, 0, 0.8],
                    outline: {
                        // autocasts as new SimpleLineSymbol()
                        color: [255, 255, 0],
                        width: 2
                    }
                };

                const polygonGraphic = new Graphic({
                    geometry: resGeometry,
                    symbol: fillSymbol
                });

                // sketchLayer.add(polygonGraphic)

                let area = geometryEngine.geodesicArea(polygonGraphic.geometry, "square-meters");
                let count = 0;
                // let len = polygonGraphic.geometry.rings[0].length;
                // for (let i = 0; i < len; i++) {
                //     count += polygonGraphic.geometry.rings[0][i][2];
                // }

                // let len = rings.length;
                // for (let i = 0; i < len; i++) {
                //     count += rings[i][2];
                // }

                // let depth = parseFloat(document.getElementById("depthInput").value);
                // let averageH = count / len;
                let depth = that.state.depth * -1
                if ((hight - that.minHight + depth) > 0) {
                    that.volumn += (hight - that.minHight + depth) * area;
                }
            }
        }

        function getExtentGeometryRings(hightGeometry, geometry) {
            // let rings = null;
            // await elevationLayer.queryElevation(geometry).then(function (result) {
            //     result.geometry.rings[0];
            // })


            let hightRings = hightGeometry.paths[0];
            let rings = geometry.rings[0];
            let minLon = rings[0][0];
            let minLat = rings[0][1];
            let maxLon = rings[0][0];
            let maxLat = rings[0][1];

            that.minHight = hightRings[0][2];
            for (let i = 1; i < rings.length; i++) {
                if (rings[i][0] > maxLon) {
                    maxLon = rings[i][0];
                } else if (rings[i][0] < minLon) {
                    minLon = rings[i][0];
                }

                if (rings[i][1] > maxLat) {
                    maxLat = rings[i][1];
                } else if (rings[i][1] < minLat) {
                    minLat = rings[i][1];
                }

                if (hightRings[i][2] < that.minHight) {
                    that.minHight = hightRings[i][2];
                }
            }

            return [
                [minLon, maxLat],
                [minLon, minLat],
                [maxLon, minLat],
                [maxLon, maxLat]
            ]
        }

        function calAmountOfCut(hightGeometry, cutGeometry) {
            let extentRings = getExtentGeometryRings(hightGeometry, cutGeometry);
            let lonOffset = (extentRings[2][0] - extentRings[0][0]) / (that.divideLevel - 1);
            let latOffset = (extentRings[0][1] - extentRings[1][1]) / (that.divideLevel - 1);
            let rings = [];
            for (let x = 0; x < that.divideLevel; x++) {
                for (let y = 0; y < that.divideLevel; y++) {
                    rings.push([extentRings[0][0] + lonOffset * x, extentRings[0][1] - latOffset * y])
                }
            }

            const polyline = {
                type: "polyline", // autocasts as new Polyline()
                paths: rings,
                spatialReference: {
                    wkid: 102100
                }
            };
            const lineSymbol = {
                type: "simple-line", // autocasts as SimpleLineSymbol()
                color: [226, 119, 40],
                width: 4
            };

            const polylineGraphic = new Graphic({
                geometry: polyline,
                symbol: lineSymbol
            });

            if (that.elevationLayer != undefined) {
                that.elevationLayer.queryElevation(polylineGraphic.geometry).then(function (result) {
                    console.log(result);
                    let paths = result.geometry.paths[0];
                    let len = paths.length;
                    // let count = (divideLevel-1)*(divideLevel-1);
                    let ii = 0;
                    for (let i = 0; i < len - that.divideLevel - 1; i++) {
                        if ((i + 1) % that.divideLevel == 0)
                            continue;
                        let rings = [
                            [paths[i][0], paths[i][1]],
                            [paths[i + 1][0], paths[i + 1][1]],
                            [paths[i + 1 + that.divideLevel][0], paths[i + 1 + that.divideLevel][1]],
                            [paths[i + that.divideLevel][0], paths[i + that.divideLevel][1]]
                        ];

                        let hight = (paths[i][2] + paths[i + 1][2] + paths[i + 1 + that.divideLevel][2] + paths[i + that.divideLevel][2]) / 4;


                        // let rings = [paths[i], paths[i + 1], paths[i + 1 + divideLevel], paths[i + divideLevel]];
                        calAmountOfCutByGeometry(rings, cutGeometry, hight);
                        ii++;
                        // console.log(ii);
                    }

                    // for (let i = 0; i < len - divideLevel - 1; i++) {
                    //     let rings = [paths[i], paths[i + 1], paths[i + 1 + divideLevel], paths[i + divideLevel]];
                    //     calAmountOfCutByGeometry(rings, cutGeometry)
                    // }

                    document.getElementById("volumnInput").value = that.volumn;
                })
            }


        }
    }

    drawCutGeometry (type) {
        if (this.sketchViewModel) {
            this.sketchViewModel.create(type)
        }
    }
    addCutTileLayer () {
        const { state, view, cutGeometries, meshLayer, cutLayer, sketchLayer, sketchViewModel } = this
        const that = this
        const height = 257;
        const width = 257;
        const canvas = document.createElement("canvas");
        canvas.id = "canvas";
        canvas.width = width;
        canvas.height = height;
        const updateGround = function () {
            view.map.ground.layers.remove(cutLayer)
            that.cutLayer = new CutTileLayer.CutTileLayer({
                title: 'cut切片图层',
                cutGeometries: cutGeometries,
                view: view,
                meshGraLayer: meshLayer,//设置围边图层
                groundTerrain: false,//底面地形开关
                depth: state.depth * -1,
                canvas,
                elevationLayer: that.elevationLayer
            });
            view.map.ground.layers.add(that.cutLayer);
            that.cutLayer.setMesh()
            // view.map.allLayers.forEach(function(layer) {
            //     if (layer.type === "scene") {
            //         layer.filter = new SceneFilter({
            //             geometries: cutGeometries
            //         });
            //     }
            // });
        }
        updateGround();
        sketchViewModel.cancel()
        sketchLayer.removeAll()
    }
    startCut () {
        const { cutGeometries, cutLayer, view, meshLayer, _CutTileLayer } = this
        if (cutGeometries.length == 0) {
            alert('请先绘制几何')
            return;
        }
        // if (cutLayer) {
        //     cutLayer.meshGraLayer && cutLayer.meshGraLayer.removeAll();
        //     view.map.remove(cutLayer)
        //     this.cutLayer = null
        // }
        // this.depth = document.getElementById("depthInput").value * -1
        // this.cutLayer = new CutTileLayer({
        //     url: "//elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer",
        //     title: 'cut切片图层',
        //     cutGeometries: cutGeometries,
        //     view: view,
        //     meshGraLayer: meshLayer,//设置围边图层
        //     groundTerrain: true,//底面地形开关
        //     depth: this.depth,
        //     opacity: 1, // 避免被优化掉
        //     elevationLayer: this.elevationLayer
        // })
        // // view.map.add(this.cutLayer)
        // view.map.ground.layers.add(this.cutLayer)
        // //设置侧边、底面
        // this.cutLayer.setMesh()

        this.addCutTileLayer()

        //
        this.cutBaseLayer = new CutBaseTileLayer({
            cutGeometries: cutGeometries,
            view: view
        });
        view.map.add(this.cutBaseLayer);
    }
    clearAll () {
        const { cutLayer, view, meshLayer, sketchViewModel, sketchLayer, lastGrounds, cutBaseLayer } = this
        if (cutLayer) {
            view.map.ground.layers.remove(cutLayer)
            this.cutLayer = null
        }
        cutBaseLayer && view.map.remove(cutBaseLayer)
        this.cutBaseLayer = null
        lastGrounds.forEach(function(ground) {
            view.map.ground.layers.remove(ground)
        });
        this.lastGrounds = []
        this.cutGeometries = []
        sketchViewModel.cancel()
        sketchLayer.removeAll()
        meshLayer.removeAll();
        document.getElementById("volumnInput").value = 0;
    }

    render() {
        return (
            <div id='viewDiv'>
                <div className={styles.funPanel}>
                    <div className={styles.row}>
                        <span className={styles.text}>开挖深度：</span>
                        <input
                            type='number'
                            id="depthInput"
                            value={this.state.depth}
                            onChange={(e) => this.setState({ depth: parseInt(e.target.value) || 0 })}
                        />
                        <span className={styles.text}>米</span>
                    </div>
                    <div className={styles.row}>
                        <span className={styles.text}>开挖挖方：</span>
                        <input type='number' id="volumnInput" min='0' value="0"/>
                        <span className={styles.text}>立方米</span>
                    </div>
                    <div className={styles.row}>
                        <span className={styles.drawBtn} onClick={() => this.drawCutGeometry('rectangle')}>矩形</span>
                        <span className={styles.drawBtn} onClick={() => this.drawCutGeometry('circle')}>圆形</span>
                        <span className={styles.drawBtn} onClick={() => this.drawCutGeometry('polygon')}>自定</span>
                    </div>
                    <div className={styles.row}>
                        <span className={styles.btn} onClick={() => this.startCut()}>开挖</span>
                        <span className={styles.btn} onClick={() => this.clearAll()}>清除</span>
                    </div>
                </div>
            </div>
        )
    }
}