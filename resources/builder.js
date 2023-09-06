/**
	Open Innovations tool that, for every feature in the input geography,
	calculates the best matching feature in a secondary geography and 
	reports the percentage overlap.
	Version 0.1
 */
(function(root){

	var OI = root.OI || {};
	if(!OI.ready){
		OI.ready = function(fn){
			// Version 1.1
			if(document.readyState != 'loading') fn();
			else document.addEventListener('DOMContentLoaded', fn);
		};
	}


	function Bounds(b){
		if(!b) b = {};
		if(!b._northEast) b._northEast = {'lat':-90,'lng':-180};
		if(!b._southWest) b._southWest = {'lat':90,'lng':180};
		this.N = b._northEast.lat;
		this.E = b._northEast.lng;
		this.S = b._southWest.lat;
		this.W = b._southWest.lng;
		this.expand = function(lonlat){
			this.N = Math.max(this.N,lonlat[1]);
			this.E = Math.max(this.E,lonlat[0]);
			this.S = Math.min(this.S,lonlat[1]);
			this.W = Math.min(this.W,lonlat[0]);
			return this;
		};
		this.get = function(){
			return new L.LatLngBounds(
				new L.LatLng(this.N, this.E),
				new L.LatLng(this.S, this.W)
			);
		};
	}
	function clone(json){ return JSON.parse(JSON.stringify(json)); }
	function niceSize(b){
		if(b > 1e12) return (b/1e12).toFixed(2)+" TB";
		if(b > 1e9) return (b/1e9).toFixed(2)+" GB";
		if(b > 1e6) return (b/1e6).toFixed(2)+" MB";
		if(b > 1e3) return (b/1e3).toFixed(2)+" kB";
		return (b)+" bytes";
	}
	function popuptext(feature){
		// does this feature have a property named popupContent?
		var popup = '';
    var t,tags,bits,title,p,f,added;
		if(feature.properties){
			// If this feature has a default popup
			// Convert "other_tags" e.g "\"ele:msl\"=>\"105.8\",\"ele:source\"=>\"GPS\",\"material\"=>\"stone\""
			if(feature.properties.other_tags){
				tags = feature.properties.other_tags.split(/,/);
				for(t = 0; t < tags.length; t++){
					tags[t] = tags[t].replace(/\"/g,"");
					bits = tags[t].split(/\=\>/);
					if(bits.length == 2){
						if(!feature.properties[bits[0]]) feature.properties[bits[0]] = bits[1];
					}
				}
			}
			if(feature.properties.popup){
				popup = feature.properties.popup.replace(/\n/g,"<br />");
			}else{
				title = '';
				if(feature.properties.title || feature.properties.name || feature.properties.Name) title = (feature.properties.title || feature.properties.name || feature.properties.Name);
				//if(!title) title = "Unknown name";
				if(title) popup += '<h3>'+(title)+'</h3>';
				added = 0;
				for(f in feature.properties){
					if(f != "Name" && f!="name" && f!="title" && f!="other_tags" && (typeof feature.properties[f]==="number" || (typeof feature.properties[f]==="string" && feature.properties[f].length > 0))){
						popup += (added > 0 ? '<br />':'')+'<strong>'+f+':</strong> '+(typeof feature.properties[f]==="string" && feature.properties[f].indexOf("http")==0 ? '<a href="'+feature.properties[f]+'" target="_blank">'+feature.properties[f]+'</a>' : feature.properties[f])+'';
						added++;
					}
				}
			}
			// Loop over properties and replace anything
			for(p in feature.properties){
				while(popup.indexOf("%"+p+"%") >= 0){
					popup = popup.replace("%"+p+"%",feature.properties[p] || "?");
				}
			}
			popup = popup.replace(/%type%/g,feature.geometry.type.toLowerCase());
			// Replace any remaining unescaped parts
			popup = popup.replace(/%[^\%]+%/g,"?");
		}
		return popup;
	}
	function FileLoader(el,opts){
		if(!opts) opts = {};
		this.loaded = false;
		if(!opts.progressbar) opts.progressbar = el.querySelector('.progressbar .progress-inner');
		opts.progressbar.style.background = opts.colour;

		var _obj = this;

		this.loader = OI.ReadGeoJSONFeatures(el.querySelector('input[type=file]'),{
			'init': function(arg){
				this.collection = [];
				this.done = [];
				this.txt = "";
				this.length = 0;
				this.moved = false;
				this.timer = new Date();
				el.querySelector('.summary').innerHTML = 'File: '+arg.file.name+' ('+niceSize(arg.size)+')<br />Found <span class="features">0</span> features.';

				_obj.features = [];
				this.geo = L.geoJSON({'type':'FeatureCollection','features':[]},{
					'style': { "color": opts.colour, "weight": 2, "opacity": 0.8, "fillOpacity": 0.08 }
				}).addTo(opts.map);
				this.geo.bindPopup(function(feature){ return popuptext(feature.feature); });
				
				if(!this.layerGroup){
					// Create a new layerGroup
					this.layerGroup = new L.LayerGroup();
					this.layerGroup.addTo(opts.map);
				}

				if(this.geo) this.geo.clearLayers();
			},
			'progress': function(chunk,start,end,len){
				this.txt += chunk;
				var pc = Math.min(100,(100*end/len)).toFixed(1)+'%';
				opts.progressbar.style.width = pc;
				if(this.geo){
					var geojson = {'type':this.typ};
					geojson[(this.typ=="GeometryCollection" ? "geometries":"features")] = clone(this.collection);
					if(this.collection.length > 0) _obj.features.push.apply(_obj.features,clone(this.collection));
					this.length += this.collection.length;
					this.collection = [];
					this.geo.addData(geojson);
				}
				el.querySelector('.summary .features').innerHTML = this.length;
				if(typeof opts.progress==="function") opts.progress.call(opts['this']||this);
			},
			'complete': function(arg){
				var diff = (((new Date()).getTime() - this.timer.getTime())/1000);
				el.querySelector('.summary').innerHTML = 'File: '+arg.file.name+' ('+niceSize(arg.size)+')<br />Found <span class="features">'+this.length+'</span> feature'+(this.length==1?'':'s')+' in '+diff+'s';
				if(arg.size > 1e6) this.txt = '[truncated]\n'+this.txt.substr(1,1e6);
				var b = new Bounds(this.geo.getBounds());
				opts.map.fitBounds(b.get());
				
				// Build a select box
				_obj.selector = document.createElement('select');
				if(typeof opts.select==="function") _obj.selector.addEventListener('change',opts.select);
				el.appendChild(_obj.selector);
				var opt = '<option value="">Select a property for the feature ID</option>';
				for(var key in _obj.features[0].properties){
					opt += '<option value="'+key+'">'+key+' e.g. '+_obj.features[0].properties[key]+'</option>';
				}
				_obj.selector.innerHTML = opt;
				_obj.loaded = true;
				if(typeof opts.complete==="function") opts.complete.call(opts['this']||this);
			}
		});
	}
	function Application(opts){
		if(!opts) opts = {};
		if(!opts.map) opts.map = document.getElementById('map');
		var colours = ['#00B6FF','#D73058'];

		if(!this.map){
			var el = opts.map;
			el.innerHTML = '';
			if(!el){
				el = document.createElement('div');
				el.classList.add('map');
				document.querySelector('#file1 textarea').after(el);
			}
			this.map = L.map(el,{'scrollWheelZoom':true}).setView([53.7965, -1.5478], 6);
			// CartoDB map
			L.tileLayer('https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', {
				attribution: 'Tiles: &copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>',
				subdomains: 'abcd',
				maxZoom: 19
			}).addTo(this.map);
		}

		this.setGeo = function(lat,lon,city){
			this.map.flyTo([lat,lon],6,{animate:true,duration:0});
			return this;
		};
		
		this.moved = false;
		
		var _obj = this;
		function progress(){
			var bounds,b,f;
			for(f = 0; f < files.length; f++){
				if(files[f].loader.geo){
					if(!bounds) bounds = files[f].loader.geo.getBounds();
					else{
						b = files[f].loader.geo.getBounds();
						if(b._southWest){
							if(b._southWest.lat < bounds._southWest.lat) bounds._southWest.lat = b._southWest.lat;
							if(b._northEast.lat > bounds._northEast.lat) bounds._northEast.lat = b._northEast.lat;
							if(b._southWest.lon < bounds._southWest.lon) bounds._southWest.lon = b._southWest.lon;
							if(b._northEast.lon > bounds._northEast.lon) bounds._northEast.lon = b._northEast.lon;
						}
					}
				}
			}
			if(!_obj.moved){
				if(bounds._southWest){
					_obj.map.fitBounds(bounds);
				}
				_obj.moved = true;
			}
		}
		function loaded(){
			var done = 0;
			var f;
			for(f = 0; f < files.length; f++){
				if(files[f].loaded) done++;
			}
			if(done == files.length) matchFeatures();
		}
		
		function matchFeatures(){
			_obj.features = files[0].features;
			var i,f,p;
      for(i = 0; i < files.length; i++){
				for(f = 0; f < files[i].features.length; f++){
					p = {'bbox':turf.bbox(files[i].features[f]),'properties':files[i].features[f].properties};
					p.poly = files[i].features[f];
					if(i==0){
						p.area = turf.area(files[i].features[f]);
						p.matches = new Array(files.length);
					}
					files[i].features[f] = p;
				}
			}
			buildOutput();			
		}
		var midx = 0;
		function findMatches(){

			if(midx < files[0].features.length){
        
        var bbox1,bbox2,i,f2,overlap,fract;
				if(midx==0){
					document.getElementById('message').innerHTML = '<div class="spinner" style="text-align:center;"><img src="https://open-innovations.org/resources/images/loader.svg" alt="Loading..." /></div><div class="text"></div>';
					
				}
				document.querySelector('#message .text').innerHTML = '<p>Matching feature <span class="features">'+(midx+1)+'</span>/<span class="features">'+files[0].features.length+'</span></p>';

				bbox1 = files[0].features[midx].bbox;
				for(i = 1; i < files.length; i++){
					files[0].features[midx].matches[i] = [];
					for(f2 = 0; f2 < files[i].features.length; f2++){
						bbox2 = files[i].features[f2].bbox;
						// 2 is to right of 1 or 2 is to the left of 1 or 2 is above 1 or 2 is below 1
						if(!(bbox2[0] > bbox1[2] || bbox2[2] < bbox1[0] || bbox2[1] > bbox1[3] || bbox2[3] < bbox2[1])){
							overlap = turf.intersect(files[0].features[midx].poly, files[i].features[f2].poly);
							if(overlap){
								fract = parseFloat((turf.area(overlap)/files[0].features[midx].area).toFixed(3));
								files[0].features[midx].matches[i].push({'fract':fract,'properties':files[i].features[f2].properties});
							}
						}
					}
				}
				midx++;
				setTimeout(findMatches,20);
			}else{
				finish();
			}
		}
		function finish(){
			var csv = '';
			var json = {};
			var line = '';
			var i,f,v,values,min,idx,val;
			csv += files[0].selector.value;
			for(i = 1; i < files.length; i++) csv += ','+files[i].selector.value+',overlap';
			csv += "\n";
			
			for(f = 0; f < files[0].features.length; f++){
				line = '';
				key = ""
				if(files[0].selector.value in files[0].features[f].properties){
					key = files[0].features[f].properties[files[0].selector.value];
					line += (files[0].features[f].properties[files[0].selector.value]);
				}
				if(key) json[key] = {};
				for(i = 1; i < files.length; i++){
					line += ',';
					values = files[0].features[f].matches[i];
					if(values && values.length > 0 && values[0]){
						min = 0;
						idx = -1;
						for(v = 0; v < values.length; v++){
							if(key) json[key][values[v].properties[files[i].selector.value]] = values[v].fract;
							val = values[v].fract;
							if(val > min){
								idx = v;
								min = val;
							}
						}
						if(idx >= 0 && files[i].selector.value in values[idx].properties){
							line += values[idx].properties[files[i].selector.value]+','+values[idx].fract;
						}else{
							line += ',';
						}
					}else{
						line += ',';
						console.warn('No values for feature '+f,files[0].features[f]);
					}
				}
				csv += line+"\n";
			}
			document.getElementById('message').innerHTML = "";
			document.getElementById('output').innerHTML = '<h2>Lookup table</h2><textarea>'+csv+'</textarea><p style="text-align:center;font-size:1em;"><button type="button" id="save" class="c3-bg">Save as CSV</button></p>';
			document.getElementById('json').innerHTML = '<h2>Lookup JSON</h2><textarea>'+JSON.stringify(json)+'</textarea><p style="text-align:center;font-size:1em;"><button type="button" id="savejson" class="c3-bg">Save as JSON</button></p>';
			document.getElementById('save').addEventListener('click',function(){
				console.log('save');

				// Bail out if there is no Blob function
				if(typeof Blob!=="function") return this;

				var textFileAsBlob = new Blob([csv], {type:'text/plain'});
				var fileNameToSaveAs = "lookup-"+files[0].selector.value.replace(/ /,"_")+"-"+files[1].selector.value.replace(/ /,"_")+".csv";

				function destroyClickedElement(event){ document.body.removeChild(event.target); }

				var dl = document.createElement("a");
				dl.download = fileNameToSaveAs;
				dl.innerHTML = "Download File";
				if(window.webkitURL != null){
					// Chrome allows the link to be clicked
					// without actually adding it to the DOM.
					dl.href = window.webkitURL.createObjectURL(textFileAsBlob);
				}else{
					// Firefox requires the link to be added to the DOM
					// before it can be clicked.
					dl.href = window.URL.createObjectURL(textFileAsBlob);
					dl.onclick = destroyClickedElement;
					dl.style.display = "none";
					document.body.appendChild(dl);
				}
				dl.click();
			});
			document.getElementById('savejson').addEventListener('click',function(){
				console.log('save json',json);

				// Bail out if there is no Blob function
				if(typeof Blob!=="function") return this;

				var textFileAsBlob = new Blob([JSON.stringify(json)], {type:'text/json'});
				var fileNameToSaveAs = "lookup-"+files[0].selector.value.replace(/ /,"_")+"-"+files[1].selector.value.replace(/ /,"_")+".json";

				function destroyClickedElement(event){ document.body.removeChild(event.target); }

				var dl = document.createElement("a");
				dl.download = fileNameToSaveAs;
				dl.innerHTML = "Download File";
				if(window.webkitURL != null){
					// Chrome allows the link to be clicked
					// without actually adding it to the DOM.
					dl.href = window.webkitURL.createObjectURL(textFileAsBlob);
				}else{
					// Firefox requires the link to be added to the DOM
					// before it can be clicked.
					dl.href = window.URL.createObjectURL(textFileAsBlob);
					dl.onclick = destroyClickedElement;
					dl.style.display = "none";
					document.body.appendChild(dl);
				}
				dl.click();
			});
		}
		function buildOutput(){
			var good = 0;
			for(var i = 0; i < files.length; i++){
				if(files[i].selector && files[i].selector.value) good++;
			}
			if(good==files.length){
				findMatches();
			}
		}

		var fileareas = document.querySelectorAll('#files .file');
		var files = new Array(fileareas.length);
		for(var f = 0; f < fileareas.length; f++) files[f] = new FileLoader(fileareas[f],{'map':this.map,'colour':colours[f],'complete':loaded,'progress':progress,'this':this,'select':buildOutput});

		return this;
	}

	OI.Application = Application;

	root.OI = OI||root.OI||{};
	
})(window || this);

OI.ready(function(){
	
	var app = new OI.Application({});
	app.setGeo(53.7965, -1.5478);

});