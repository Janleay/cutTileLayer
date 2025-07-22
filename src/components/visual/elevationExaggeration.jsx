import React from "react";
import SceneView from '@geoscene/core/views/SceneView'
import Map from '@geoscene/core/Map'
import ElevationLayer from '@geoscene/core/layers/ElevationLayer'
import GraphicsLayer from '@geoscene/core/layers/GraphicsLayer'
import SketchViewModel from '@geoscene/core/widgets/Sketch/SketchViewModel'
import LocalElevation from './js/LocalElevation';
import styles from './css/elevationExaggeration.module.css';
import MapImageLayer from '@geoscene/core/layers/MapImageLayer';
// import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import Graphic from "@geoscene/core/Graphic";
import * as geometryEngine from "@geoscene/core/geometry/geometryEngine";

export default class ElevationExaggerationModule extends React.Component {
    constructor(props) {
        super(props);
        this.sketchVM = null;
        this.view = null;
    }

    componentDidMount() {
        let that = this;

        let mapimageLayer = new MapImageLayer({
            url:'https://services.arcgisonline.com/arcgis/rest/services/World_Terrain_Base/MapServer'
        })

        this.view = new SceneView({
            // An instance of Map or WebScene
            map: new Map({
                // basemap: 'satellite',
                ground:'world-elevation',
                layers:[mapimageLayer]
            }),
            viewingMode:'global',
            container: 'viewDiv',
            camera:{
                heading:350.7397014931833,
                tilt: 56.691067564275,
                fov: 55,
                position:{
                    x:13354818.090997182,
                    y: 4359889.49626375,
                    z: 197.60741683188829,
                    spatialReference:{
                        wkid: 102100
                    }
                }
            }
        })

        this.view.on('click',function(){
            console.log(that.view.camera);
        })

        this.graphicsLayer = new GraphicsLayer();
        this.view.map.add(this.graphicsLayer);

        const elevLyr = new ElevationLayer({
            // Custom elevation service
            url: 'https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/TopoBathy3D/ImageServer',
        })
        // Add elevation layer to the map's ground.
        // this.view.map.ground.layers.add(elevLyr)
        // console.log(view)
        this.sketchVM = new SketchViewModel({
            layer: new GraphicsLayer(),
            view: this.view,
        })

        this.sketchVM.on('create', (event) => {
            // check if the create event's state has changed to complete indicating
            // the graphic create operation is completed.
            if (event.state === 'complete') {

                let val = document.getElementById('heightVal').value;
                let _val = parseInt(val);

                let minHight = 999999;
                for(let i=0; i<event.graphic.geometry.rings[0].length;i++){
                    if(event.graphic.geometry.rings[0][i][2] < minHight){
                        minHight = event.graphic.geometry.rings[0][i][2];
                    }
                }

                _val = minHight - _val;

                that.view.map.ground.layers.add(
                    new LocalElevation(event.graphic.geometry, _val)
                )

                // that.drawPolygons(event.graphic.geometry);
            }
        })

        mapimageLayer.when(function(){
            // that.view.extent = mapimageLayer.fullExtent;
        })
    }

    drawPolygons(geometry){

        const ptBuff = geometryEngine.buffer(geometry, 0.5, "meters");
        console.log(ptBuff)

        // ptBuff.hasM=true;
        // geometry.rings.hasZ= false;
        const polygon = {
          type: "polygon", // autocasts as new Polygon()
          rings: ptBuff.rings,
          hasM:true,
          spatialReference: geometry.spatialReference,
        };

        const fillSymbol = {
          type: "simple-fill", // autocasts as new SimpleFillSymbol()
          color: [227, 139, 79, 0.8],
          outline: {
            // autocasts as new SimpleLineSymbol()
            color: [255, 255, 255],
            width: 0
          }
        };

        const polygonGraphic = new Graphic({
          geometry: polygon,
          symbol: fillSymbol
        });

       this.graphicsLayer.add(polygonGraphic);
    }

    drawPolygon() {
        this.sketchVM.create('polygon')
    }

    render() {
        return (
            <div id='viewDiv'>
                <div className={styles.toolsbox}>
                    <button className={styles.drawPolygonBtn} onClick={() => this.drawPolygon()}>开始绘制</button>
                    <input id="heightVal" className={styles.heightVal} type="text" />
                </div>
            </div>
        )
    }
}