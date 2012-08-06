//Zepto(function($){
	
// $('#maps').css({
// 	width:$(window).width(),
// 	height:$(window).height()
// })
	
var settings = {
	incidentZoomLevel: 9,
	incidentRadiusMeter: 10000,
	borderOpacity: 0.8,
	borderColor:'#000000',
	showDebug: false,
	maxBumpPointsRadius: 15,
	numBumpPoints: 6, // NB Only even numbers
	animationInterval: 5000,
	animationWaitInterval: 10000,
	autoAnimation: false,
	showInfoPopup: true,
	initialLatLng:[52.08119, 14.52667],
	initialZoom:9
};

var map = L.map('map',{
	inertia:false,
	minZoom:4,
	maxZoom:10,
	worldCopyJump:false
	//fadeAnimation:true,
	//zoomAnimation:true
}).setView(settings.initialLatLng, settings.initialZoom);

// Map style
L.tileLayer('http://{s}.tile.stamen.com/toner-lite/{z}/{x}/{y}.png').addTo(map); // Stamen Toner
//L.tileLayer('http://localhost:20008/tile/border-bumps/{z}/{x}/{y}.png?updated=' + new Date().getTime()).addTo(map); // Local TileMill 
//L.tileLayer('http://192.168.12.126:8888/v2/border-bumps-4-10/{z}/{x}/{y}.png').addTo(map); // Julian's local server


// Data -------------------------------------------

var countryLayerMap = new Object();

var markerArray = [];
var selectedIncidentMarkerIndex = null;

// UI ---------------------------------------------

var scale = L.control.scale().addTo(map);

// Animation
var markerAnimationTimer;
var markerAnimationInteractionTimer;
restartMarkerAnimation();


// -------------------------------------------------

// Load incidents
d3.tsv("data/incidents.tsv", function(data) {
			
	// Create marker for each incident
	data.forEach(function(incident, index) {
	
		var d= incident.TimeStamp;
		var dateOut= "";
		dateOut += d.substring(6, 8)+"-"+d.substring(4, 6)+"-"+d.substring(0, 4)+" ";
		dateOut += d.substring(9, 11)+":"+d.substring(11, 13)+":"+d.substring(13, 15);
	
		var popupText = "";
		popupText += "TimeStamp: <span>" + dateOut + "</span><br/>";
		popupText += "MCC: <span>" + incident.CurMCC_ID + "</span><br/>";
		popupText += "Cell_ID: <span>" + incident.CurCell_ID + "</span><br/>";
		popupText += "Cell_Owner: <span>" + incident.CurCell_Provider + "</span><br/>";
		popupText += "RSSI: <span>" + incident.RSSI + "</span><br/>";
		popupText += "Lat: <span>" + incident.Lat + "</span><br/>";
		popupText += "Lng: <span>" + incident.Lng + "</span><br/>";
		popupText += "Device: <span>" + incident.Device + "</span><br/>";
	
		// Incident circle (size depends on RSSI)
		var marker = L.circleMarker([incident.Lat, incident.Lng], {
		    color: 'red',
			opacity:0.9,
		    fillColor: 'red',
		    fillOpacity: 0.2,
			stroke:false,
			title: incident.CurCell_Provider
		}).addTo(map)
		.bindPopup(popupText, {
			offset: new L.Point(0, 0),
			autoPan: false
		})
		.on("click", function() {
			//console.log("Clicked on marker", this)
			animateToIncident(this);
		});
		marker._incident = incident;
		marker._isBumped = false;
		marker._index = index;
		markerArray.push(marker);
	
		// Incident point (center of circle marker)
		L.circle([incident.Lat, incident.Lng], 300, {
			fillOpacity:1,
			fillColor:'#580E05',
			stroke:false,
			color:'#278073',
			weight:1,
			opacity:0.8
		}).addTo(map);
		
		L.circle([incident.Lat, incident.Lng], 3000, {
			fillOpacity:0.2,
			fillColor:'red',
			stroke:false,
			color:'red',
			weight:1,
			opacity:0.2
		}).addTo(map);
	})

	updateMarkerSizes();
});

// Load country polygons
d3.json("data/europe.geo.json", function(collection) {
	L.geoJson(collection, {

		style: function (feature) {
			var myStyle = {
			    "color": settings.borderColor,
			    "weight": 2,
			    "opacity": settings.borderOpacity,
				"fill": false
			};
			return myStyle;
		},
	
		onEachFeature: function (feature, layer) {
			var countryCode = feature.properties.ISO_A2;
			if (countryLayerMap[countryCode] !== undefined){
				console.warn("Country geometry already exists! " + countryCode);
			}
		
			if (layer._layers !== undefined) {
				// Add all layers for country
				countryLayerMap[countryCode] = layer._layers;
			} else {
				// Add single layer as array for country
				// TODO: use actual _leaflet_id
				countryLayerMap[countryCode] = { "0": layer };
			}
		}

	}).addTo(map);

	// TEST Select one incident
	//animateToIncident(testIncident);

});


// Interaction handlers -----------------------------------

map.on('zoomend', function(e) {
	//console.log("zoomend");

	// Update all markers according to current zoom level
	updateMarkerSizes();
});

map.on('moveend', function(e) {
	//console.log("moveend");

	// Select Incident after zoom and pan animation
	var incidentMarker = markerArray[selectedIncidentMarkerIndex];
	if (incidentMarker && incidentMarker.animateToIncident) {
		selectIncident(incidentMarker);
		incidentMarker.animateToIncident = false;
	}
});
	
map.on("mousemove", function(e) {
	// Stops animation on user interaction
	clearInterval(markerAnimationTimer);
	clearTimeout(markerAnimationInteractionTimer);

	// And restarts after a while of non-interaction
	markerAnimationInteractionTimer = window.setTimeout(restartMarkerAnimation, settings.animationWaitInterval);
})

// TEST
map.on('click', function(e) {
	//console.log("Clicked on " + e.latlng);

	// TEST (Does not work anymore since using of markers)
	//animateToIncident({"Lat": e.latlng.lat, "Lng": e.latlng.lng, "LastMCC_CountryCode": "DE", "CurMCC_CountryCode": "PL"})
});

// TEST
d3.select('#nextButton').on('click', function(e) {
	//gotoNextMarker();
});


function _testPopup() {
	var incidentMarker = markerArray[selectedIncidentMarkerIndex];
	
}

// --------------------------------------------------------


function restartMarkerAnimation() {
	if (settings.autoAnimation) {
		markerAnimationTimer = window.setInterval(gotoNextMarker, settings.animationInterval);
	}
}

function updateMarkerSizes() {
	markerArray.forEach(function(marker, index) {
		var dbFactor = marker._incident.RSSI / -100;
		var size = dbFactor * settings.incidentRadiusMeter * scale.pixelFactor;

		//marker._path.setAttribute("transform", "rotate("+frame+","+marker._point.x+","+marker._point.y+")");

		marker.setStyle({
			weight: size / 30
		})
		marker.setRadius(size);
		
		// Also update
		//updatePopupOffset(marker);
	});
}

function gotoNextMarker() {
	//console.log("gotoNextMarker");

	selectedIncidentMarkerIndex++;
	if (selectedIncidentMarkerIndex >= markerArray.length) {
		selectedIncidentMarkerIndex = 0; 
	}

	var incidentMarker = markerArray[selectedIncidentMarkerIndex];
	animateToIncident(incidentMarker);
}

function selectIncident(/* Marker */ incidentMarker) {

	if (!incidentMarker._isBumped) {
		// Bump the two countries of the incident
		bumpCountries(
			incidentMarker._incident.LastMCC_CountryCode,
			incidentMarker._incident.CurMCC_CountryCode,
			incidentMarker._latlng
		);
	
		// Do this only once
		incidentMarker._isBumped = true;
	} else {
		console.log("selectIncident > openIncidentPopup");
		openIncidentPopup(incidentMarker);
	}
}

function openIncidentPopup(/* Marker */ incidentMarker) {
	if (incidentMarker && settings.showInfoPopup) {
		console.log("openpopup", incidentMarker)
		//updatePopupOffset(incidentMarker);
		incidentMarker.openPopup();
	}
}

function updatePopupOffset(/* Marker */ incidentMarker) {
	incidentMarker._popup.options.offset.y = -incidentMarker._radius;
	_updatePosition(incidentMarker._popup);
}

// Modified from L.Popup._updaptePosition()
function _updatePosition(_popup) {
	if (_popup._latlng !== undefined) {
		return;
	}

	var pos = map.latLngToLayerPoint(_popup._latlng),
		is3d = L.Browser.any3d,
		offset = _popup.options.offset;

	if (is3d) {
		L.DomUtil.setPosition(_popup._container, pos);
	}

	_popup._containerBottom = -offset.y - (is3d ? 0 : pos.y);
	_popup._containerLeft = -Math.round(_popup._containerWidth / 2) + offset.x + (is3d ? 0 : pos.x);

	//Bottom position the popup in case the height of the popup changes (images loading etc)
	_popup._container.style.bottom = _popup._containerBottom + 'px';
	_popup._container.style.left = _popup._containerLeft + 'px';
}

function animateToIncident(/* Marker */ incidentMarker) {
	// close old popup
	if (markerArray[selectedIncidentMarkerIndex]) {
		if (settings.showInfoPopup) {
			markerArray[selectedIncidentMarkerIndex].closePopup();
		}
	}

	// Save index of marker for interaction selections (e.g. click on marker)
	selectedIncidentMarkerIndex = incidentMarker._index;

	if (map.getCenter().equals(incidentMarker.getLatLng())) {
		// centered on marker
		selectIncident(incidentMarker);
	} else {
		//start animation
		incidentMarker.animateToIncident = true;
		map.setView(incidentMarker._latlng, settings.incidentZoomLevel);
	}
}

function bumpCountries(/* String */ fromCountryCode, /* String */ toCountryCode, /* L.LatLng */ incidentLatLng) {
	//console.log("bumpCountries: from " + fromCountryCode + " to " + toCountryCode);

	// Bump only closest layer (not all)
	var fromCountryClosestLayer = findClosestLayer(fromCountryCode, incidentLatLng);
	var toCountryClosestLayer = findClosestLayer(toCountryCode, incidentLatLng);

	bumpCountryLayers(fromCountryClosestLayer, toCountryClosestLayer, incidentLatLng);
}	

function findClosestLayer(/* String */ countryCode, /* L.LatLng */ pos) {
	var countryLayers = countryLayerMap[countryCode];
	var minDist = Infinity;
	var nearestLayerId;
	for (var id in countryLayers) {
		var dist = getNearestDistance(countryLayers[id]._latlngs, pos);
		if (minDist > dist) {
			minDist = dist;
			nearestLayerId = id;
		}
	}
	return countryLayers[nearestLayerId];
}

function bumpCountryLayers(/* L.Layer */ fromCountryLayer, /* L.Layer */ toCountryLayer, /* L.LatLng */ incidentLatLng) {

	// TODO Use only points in bounding box


	var toPoints = toCountryLayer._latlngs;

	// Find nearest point to incident on border of entering country
	var nearestToPointData = _findNearestPointData(toPoints, incidentLatLng);

	// Get n points around nearestPoint (n-2, n-2, n, n+1, n+2, ...)
	var toPointsToBump = getPointsAround(toPoints, nearestToPointData.index, settings.numBumpPoints);

	// Find the same points on border of leaving country
	// (might be fewer than toPointsToBump, e.g. on tri-border areas or at coastline)
	var fromPointsToBump = [];
	var fromIndicesToBump = [];
	for (var i = 0; i < toPointsToBump.length; i++) {
		var p = findEqualPoint(fromCountryLayer._latlngs, toPointsToBump[i]);
		if (p != null) {
			fromPointsToBump.push(p);
			fromIndicesToBump.push(i);
		}
	}


	if (settings.showDebug) {
		_showBumpDebug(incidentLatLng, toPointsToBump, fromPointsToBump, nearestToPointData);
	}

	// Calculate bump vectors and transform original points
	var bumpVectors = getBumpVectors(toPointsToBump, nearestToPointData, incidentLatLng);
	//transformPoints(toPointsToBump, bumpVectors);
	transitionPoints(toCountryLayer, toPointsToBump, bumpVectors);

	// Use bumpVectors to also bump fromPoints (but only the appropriate ones)
	var fromBumpVectors = bumpVectors.splice(fromIndicesToBump[0], fromIndicesToBump.length);
	//transformPoints(fromBumpVectors, fromBumpVectors);
	transitionPoints(fromCountryLayer, fromPointsToBump, fromBumpVectors);

	// Update display
	fromCountryLayer.redraw();
	toCountryLayer.redraw();
}

// Show bumping debug displays (incident, bumped lines, distance vector)
function _showBumpDebug(incidentLatLng, toPointsToBump, fromPointsToBump, nearestToPointData) {
	L.circle(incidentLatLng, 500, {fillOpacity:0.6, color:'orange', stroke:false}).addTo(map);

	L.polyline(toPointsToBump, {color: 'red', fill:true, weight:2}).addTo(map);
	L.polyline(fromPointsToBump, {color: 'blue', fill:true, weight:2}).addTo(map);

	var directionLine = [
		[nearestToPointData.point.lat, nearestToPointData.point.lng], 
		[nearestToPointData.point.lat - nearestToPointData.direction[0], nearestToPointData.point.lng - nearestToPointData.direction[1]]
	];
	L.polyline(directionLine, {color: 'orange', fill:true, weight:2}).addTo(map);
}

function transformPoints(/* Array<L.LatLng> */ points, /* Array<BumpVector> */ bumpVectors) {
	for (var i = 0; i < points.length; i++) { 
		points[i].lat += bumpVectors[i].latPush;
		points[i].lng += bumpVectors[i].lngPush;
	}
}

function getBumpVectors(/* Array<L.LatLng> */ points, nearestToPointData, /* L.LatLng */ incidentLatLng) {

	// Calculates bump vectors for both sides independently, as the distance from incident / nearestPoint to furthest point might be different.
	// This normalizes the bumping function, so both sides look smooth and go from 0-1.

	var minNormDistLeft = getNormalizedDist(points, nearestToPointData, incidentLatLng, 0, settings.numBumpPoints/2);
	var leftBumpVectors = getSidedBumpVectors(points, nearestToPointData, incidentLatLng, minNormDistLeft, 0, settings.numBumpPoints/2);

	var minNormDistRight = getNormalizedDist(points, nearestToPointData, incidentLatLng, settings.numBumpPoints/2, points.length);
	var rightBumpVectors = getSidedBumpVectors(points, nearestToPointData, incidentLatLng, minNormDistRight, settings.numBumpPoints/2, points.length);

	// Combines left and right to one array
	var bumpVectors = leftBumpVectors;
	for (var i = 0; i < rightBumpVectors.length; i++) {
		bumpVectors.push(rightBumpVectors[i]);
	}
	return bumpVectors;
}

function getSidedBumpVectors(/* Array<L.LatLng> */ points, nearestToPointData, /* L.LatLng */ incidentLatLng, minNormDist, fromIndex, toIndex) {
	var bumpVectors = [];

	for (var i = fromIndex; i < toIndex; i++) {
	
		// Bumping force depends on distance to incident
		var dist = getDistance(points[i], incidentLatLng);
		var d = nearestToPointData.dist / dist;
		var dNorm = normalize(d, minNormDist, 1);
		var force = Math.easeInOutQuad(dNorm, 0, 1, 1) * 1.0;
	
		//console.log(i + ". p: " + points[i] + ", dist:" + dist + ", d:" + d + ", dNorm:" + dNorm + ", nearestDist:" + nearestToPointData.dist + ", minD:" + minNormDist + ", force:" + force);
		var bumpVector = {'latPush': -(nearestToPointData.direction[0] * force), 'lngPush': -(nearestToPointData.direction[1] * force)};
		bumpVectors.push(bumpVector);
	};

	return bumpVectors;
}

function getNormalizedDist(/* Array<L.LatLng> */ points, nearestToPointData, /* L.LatLng */ incidentLatLng, fromIndex, toIndex) {
	var minNormDist = Infinity;
	for (var i = fromIndex; i < toIndex; i++) {
		var dist = getDistance(points[i], incidentLatLng);
		var d = nearestToPointData.dist / dist;
		if (minNormDist > d) {
			minNormDist = d;
		}
	}
	return minNormDist;
}

/**
 * Gets neighboring points around the point at given index.
 */
function getPointsAround(/* Array<L.LatLng> */ points, /* int */ index, /* int */ pointsNum) {
	var aroundPoints = [];
	var fromIndex = constrain(index - pointsNum, 0, points.length);
	var toIndex = constrain(index + pointsNum, 0, points.length);
	for (var i = fromIndex; i <= toIndex; i++) {
		aroundPoints.push(points[i]);
	}
	return aroundPoints;
}

/**
 * Searches for the given point in a points array.
 */ 
function findEqualPoint(/* Array<L.LatLng> */ points, /* L.LatLng */ point) {
	var equalPoint = null;
	for (var i = 0; i < points.length; i++) {
		// NB Points are not equal but very close together
		if (getDistance(points[i], point) < 0.00005) {
			equalPoint = points[i];
		} 
	}

	return equalPoint;
}

function transitionPoints(/* L.Layer */ countryLayer, /* Array<L.LatLng> */ points, /* Array<BumpVector> */ bumpVectors) {

	var countryLatLngs = points;

	//console.log(map.getBounds())

	// Hide simplified country path
	var countryPath = countryLayer._path;
	countryPath.setAttribute("stroke-opacity", 0);

	var originalLatLngs = countryLayer._latlngs;
	//var nonBumpingPoints = getPointsWithoutPoints(originalLatLngs, points);
	var tempCountryPolyline = new L.Polyline(originalLatLngs, {color: 'red', opacity: 0.7, weight: 3, dashArray:'5,15', fill: false, smoothFactor: 0}).addTo(map);

	//console.log(tempCountryPolyline)
	// Bump border around the incident
	transformPoints(countryLatLngs, bumpVectors);

	// Create bumped SVG data (based on now bumped countryLatLngs)
	var tempTargetPolyline = new L.Polyline(originalLatLngs, {color: 'blue', opacity: 0, weight: 2, fill: false, smoothFactor: 0}).addTo(map);
	var targetSVGData = tempTargetPolyline._path.getAttribute('d');

	// Transition from temp country polyline to bumped polyline
	console.log("starting transition...");
	d3.select(tempCountryPolyline._path)
		.transition()
		.duration(3000)
		.ease("elastic")
		.attr("d", targetSVGData)
		.each("end", function() {
			countryPath.setAttribute("stroke-opacity", settings.borderOpacity);
			countryLayer.redraw();

			map.removeLayer(tempTargetPolyline);
			map.removeLayer(tempCountryPolyline);
		
			console.log("after transition > openIncidentPopup");
			// TODO Only open it once! (Two borders are transitioned!)
			openIncidentPopup(markerArray[selectedIncidentMarkerIndex]);
		});
}

// --------------------------------------------

function getNearestDistance(/* Array<L.LatLng> */ points, /* L.LatLng */ point) {
	return _findNearestPointData(points, point).dist;
}

function findNearestPoint(/* Array<L.LatLng> */ points, /* L.LatLng */ point) {
	return _findNearestPointData(points, point).point;
}

function _findNearestPointData(/* Array<L.LatLng> */ points, /* L.LatLng */ point) {
	var nearestData = {'point': null, 'index': -1, 'dist': Infinity, 'direction': [0,0]};

	var minDist = Infinity;
	for (var i = 0; i < points.length; i++) {
		var dist = getDistance(points[i], point);
		if (minDist > dist) {
			minDist = dist;
			nearestData.point = points[i];
			nearestData.index = i;
			nearestData.dist = dist;
			nearestData.direction = [points[i].lat - point.lat, points[i].lng - point.lng];
		}
	}
	return nearestData;
}

//});

// TODO Use correct calculation for Mercator projection
function getDistance(/* L.LatLng */ pointA, /* L.LatLng */ pointB) {
	var x = pointA.lat - pointB.lat;
	var y = pointA.lng - pointB.lng;
	return Math.sqrt(x * x + y * y);
}

// Utils -----------------------------------------

function normalize(value, start, stop) {
	return (value - start) / (stop - start);
}

function constrain(value, min, max) {
	return (value > max) ? max : (value < min) ? min : value;
}

Math.easeInOutExpo = function (t, b, c, d) {
	t /= d/2;
	if (t < 1) return c/2 * Math.pow( 2, 10 * (t - 1) ) + b;
	t--;
	return c/2 * ( -Math.pow( 2, -10 * t) + 2 ) + b;
};

Math.easeInOutQuad = function (t, b, c, d) {
	t /= d/2;
	if (t < 1) return c/2*t*t + b;
	t--;
	return -c/2 * (t*(t-2) - 1) + b;
};

Math.easeInCubic = function (t, b, c, d) {
	t /= d;
	return c*t*t*t + b;
};
