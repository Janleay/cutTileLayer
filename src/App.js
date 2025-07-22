// import ElevationExaggerationModule from './components/visual/elevationExaggeration';
import {ElevationExaggerationModule} from './components/visual/CutTileLayerFinal';
import {BrowserRouter, Switch, Route} from 'react-router-dom';

function App() {
  return (
    <BrowserRouter>
      <Switch>
        {/*<Route path="/" component={CutTileLayer} />*/}
        <Route path="/" component={ElevationExaggerationModule} />
      </Switch>
    </BrowserRouter >
  );
}

export default App;
