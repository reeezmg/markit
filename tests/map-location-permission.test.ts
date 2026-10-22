import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import ts from 'typescript';
import {ref} from 'vue';

function picker(address:any,navigator:any={},ready=true){
  const path=process.env.MAP_PICKER_SOURCE||'components/MapLocationPicker.vue';
  const source=readFileSync(path,'utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('map.ts',source,ts.ScriptTarget.Latest,true);
  const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['useCurrentLocation','initMap'].includes(n.name?.text||'')).map(n=>n.getText(ast)).join('\n');
  const centers:any[]=[],addresses:any[]=[];
  class MapFixture{setCenter(value:any){centers.push(value);}setZoom(){}addListener(){}}
  class MarkerFixture{setPosition(){}addListener(){}}
  const state={locationError:ref(''),isLocating:ref(false),mapReady:ref(ready)};
  const bindings={...state,navigator,map:new MapFixture(),marker:new MarkerFixture(),geocoder:null,placesService:null,
    mapContainer:ref({}),google:{maps:{Map:MapFixture,Marker:MarkerFixture,Geocoder:class{},places:{PlacesService:class{}}}},
    useAuth:()=>({session:ref({address})}),updateAddressFromMarker:(value:any)=>addresses.push(value)};
  const api=new Function(...Object.keys(bindings),functions+';return {useCurrentLocation,initMap};')(...Object.values(bindings));
  return {...api,...state,centers,addresses};
}

test('map initialization does not request location when the company has no saved coordinates',()=>{
  let requests=0;const api=picker({lat:null,lng:null},{geolocation:{getCurrentPosition(){requests++;}}});
  api.initMap();assert.equal(requests,0);
});
test('map tolerates a company without an address and restores valid zero coordinates',()=>{
  assert.doesNotThrow(()=>picker(undefined).initMap());
  const api=picker({lat:0,lng:77});api.initMap();assert.deepEqual(api.centers,[{lat:0,lng:77}]);
});
test('denied and unsupported geolocation show a recoverable inline error without an alert',()=>{
  for(const navigator of [{},{geolocation:{getCurrentPosition(_success:any,error:any){error({code:1});}}}]){
    const api=picker(undefined,navigator);assert.doesNotThrow(()=>api.useCurrentLocation());
    assert.ok(api.locationError.value);assert.equal(api.isLocating.value,false);
  }
});
test('location button waits for map readiness and bounds its geolocation request',()=>{
  let requested=0;
  const navigator={geolocation:{getCurrentPosition(success:any,_error:any,options:any){requested++;assert.ok(options.timeout>0&&options.timeout<=15000);success({coords:{latitude:0,longitude:77}});}}};
  const waiting=picker(undefined,navigator,false);waiting.useCurrentLocation();assert.equal(requested,0);assert.ok(waiting.locationError.value);
  const ready=picker(undefined,navigator);ready.useCurrentLocation();assert.equal(requested,1);assert.deepEqual(ready.addresses,[{lat:0,lng:77}]);assert.equal(ready.isLocating.value,false);
});

test('address service failures display an inline error and successful retries clear it',()=>{
  const source=readFileSync(process.env.MAP_PICKER_SOURCE||'components/MapLocationPicker.vue','utf8').match(/<script setup[^>]*>([\s\S]*?)<\/script>/)![1];
  const ast=ts.createSourceFile('map.ts',source,ts.ScriptTarget.Latest,true);
  const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='updateAddressFromMarker')!.getText(ast);
  let status='REQUEST_DENIED';const locationError=ref(''),name=ref(''),formattedAddress=ref(''),selectedLocation=ref<any>(null);
  const geocoder={geocode(_args:any,callback:any){callback([{formatted_address:'Fixture address',address_components:[{long_name:'Fixture'}]}],status);}};
  const run=new Function('geocoder','locationError','name','formattedAddress','selectedLocation',fn+';return updateAddressFromMarker;')(geocoder,locationError,name,formattedAddress,selectedLocation);
  run({lat:0,lng:77});assert.ok(locationError.value);assert.equal(selectedLocation.value,null);
  status='OK';run({lat:0,lng:77});assert.equal(locationError.value,'');assert.equal(formattedAddress.value,'Fixture address');
});
