//Zepto(function($){
	
// $('#maps').css({
// 	width:$(window).width(),
// 	height:$(window).height()
// })
	
var settings = {
	incidentsFileName: "data/dummy-incidents.tsv",
	countriesGeoJsonFilename: "data/europe.geo.json",
	// tileServerString: 'http://localhost:8888/map/bb-eu/{z}/{x}/{y}.png', // Caravan
	tileServerString: 'http://{s}.tile.stamen.com/toner-lite/{z}/{x}/{y}.png', // Stamen Toner
	//tileServerString: 'http://localhost:20008/tile/border-bumps/{z}/{x}/{y}.png?updated=' + new Date().getTime(), // Local TileMill 
	
	incidentZoomLevel: 9,
	incidentRadiusMeter: 20000,
	borderOpacity: 0.8,
	borderColor:'#000000',
	showDebug: false,
	maxBumpPointsRadius: 15,
	numBumpPoints: 6, // NB Only even numbers
	animationInterval: 8000,
	animationWaitInterval: 4000, // Full waiting time is awi+ai!
	autoAnimation: true,
	showInfoPopup: true,
	initialLatLng:[52.08119, 14.52667],
	initialZoom:9,
	overalZoomLevel:7
};

// -24.6973,32.7688,51.0645,71.2726 (original)
var mapSouthWest = new L.LatLng(32.7688, -24.6973),
    mapNorthEast = new L.LatLng(71.2726, 51.0645),
    mapBounds = new L.LatLngBounds(mapSouthWest, mapNorthEast);

// -26.6973,32.7688,55.0645,71.2726 (detailMap original)
var detailMapSouthWest = new L.LatLng(32.7688,-24.6973),
	detailMapNorthEast = new L.LatLng(71.2726, 55.0645);

var map = L.map('map',{
	inertia:false,
	minZoom:4,
	maxZoom:10,
	worldCopyJump:false,
	fadeAnimation:false,
	markerZoomAnimation:false,
	zoomAnimation:true,
	boxZoom:false,
	maxBounds: mapBounds
}).setView(settings.initialLatLng, settings.initialZoom);


// Map style
L.tileLayer(settings.tileServerString, {
	reuseTiles:true,
	//updateWhenIdle:true,
	unloadInvisibleTiles:false
}).addTo(map); 

// Data -------------------------------------------

var countryLayerMap = new Object();

var markerArray = [];
var selectedIncidentMarkerIndex = -1;
var lastIncidentMarkerIndex = 0;

// UI ---------------------------------------------

var scale = L.control.scale().addTo(map);

// Animation
var markerAnimationTimer;
var markerAnimationInteractionTimer;
restartMarkerAnimation();


// -------------------------------------------------

// All geoJson features. Will be re-parsed on reset.
var originalCollection;
// A layer with all country layers. Will be cleared on reset.
var allCountriesLayer;


// Load country polygons
d3.json(settings.countriesGeoJsonFilename, function(collection) {
	originalCollection = collection;

	addCountriesToMap(collection);

	// Load incidents after loading countries
	loadIncidentData();
});

function addCountriesToMap(collection) {
	countryLayerMap = new Object();
	
	allCountriesLayer = L.geoJson(collection, {

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
}


function loadIncidentData() {
// Load incidents
d3.tsv(settings.incidentsFileName, function(data) {
			
	// Create marker for each incident
	data.forEach(function(incident, index) {

		//var popupText = createPopupText(incident);
		
		// Radius of cell
		incident.RSSI = getValidatedRSSIValue(incident.RSSI);
		var signalFactor = incident.RSSI / -100;
		var radius = signalFactor * settings.incidentRadiusMeter;
		
		// Position of marker (depending on incident and nearest border point)
		incident.latlng = new L.LatLng(incident.Lat, incident.Lng); // original
		var closestToLayer = findClosestLayer(incident.CurMCC_CountryCode, incident.latlng);
		var nearestPointData = _findNearestPointData(closestToLayer._latlngs, incident.latlng);
		
		//console.log("Creating marker w/ nearest point to " + incident.CurMCC_CountryCode);
		// FIXME Move cell tower circle into inverse direction sometimes; depending on actual country the incident is in
		center = new L.LatLng(incident.Lat, incident.Lng); // center of marker
		center.lat -= nearestPointData.direction[0];
		center.lng -= nearestPointData.direction[1];
		
		// Visual radial expansion style
		var bigCircle = L.circle(center, radius * 0.8, {
			fillOpacity:0.3,
			fillColor:'#FF4757',
			stroke:false,
			color:'white',
			weight:4,
			opacity:0.8,
		}).addTo(map);
		var smallCircle = L.circle(center, radius * 0.6, {
			fillOpacity:0.3,
			fillColor:'#FF4757',
			stroke:false,
			color:'white',
			weight:1,
			opacity:0.8,
		}).addTo(map);
		
		// Incident circle (size depends on RSSI)
		var marker = L.circle(center, radius, {
		    color: 'white',
			opacity:1,
		    fillColor: '#FF4757',
		    fillOpacity: 0.2,
			stroke:false,
			weight:5,
			title: incident.CurCell_Provider,
		}).addTo(map)
		.on("click", function() {
			//console.log("Clicked on marker", this)
			delayMarkerAnimationOnInteraction();
			lastIncidentMarkerIndex = selectedIncidentMarkerIndex;
			animateToIncident(this, true);
		});

		// Incident point (center of incident)
		var incidentCirle = L.circle(incident.latlng, 1000, {
			fillOpacity:1,
			fillColor:'#580E05',
			stroke:true,
			color:'white',
			weight:2,
			opacity:0.8,
		})
		.addTo(map)		// 
				// .bindPopup(popupText, {
				// 	//offset: new L.Point(0, 7),
				// 	autoPan: false
				// })
		
		marker._incident = incident;
		marker._isBumped = false;
		marker._index = index;
		marker._incidentCirle = incidentCirle;
		marker.openNow=0;
		marker._bigCircle=bigCircle;
		marker._smallCircle=smallCircle;
		markerArray.push(marker);
		
	})
	
	gotoNextMarker();
});
}

function createPopupText(incident) {
	var d = incident.TimeStamp;
	var dateOut = "";
	dateOut += d.substring(6, 8) + "-" + d.substring(4, 6) + "-" + d.substring(0, 4) + " ";
	dateOut += d.substring(9, 11) + ":" + d.substring(11, 13) + ":" + d.substring(13, 15);
	
	var popupText = "";
	popupText += "<div><span class='name'>Device: </span><span class='val'>" + incident.Device + "</span></div>";
	popupText += "<div><span class='name'>From </span><span class='val'>" + incident.LastMCC_CountryCode + "</span><span class='name'> to </span><span class='val'>" + incident.CurMCC_CountryCode + "</span></div>";
	popupText += "<div class='separator'></div>";
	popupText += "<div><span class='name'>TimeStamp: </span><span class='val'>" + dateOut + "</span></div>";
	popupText += "<div><span class='name'>MCC: </span><span class='val'>" + getValidatdValue(incident.CurMCC_ID) + "</span></div>";
	popupText += "<div><span class='name'>Cell_ID: </span><span class='val'>" + getValidatdValue(incident.CurCell_ID) + "</span></div>";
	popupText += "<div><span class='name'>Cell_Owner: </span><span class='val'>" + getValidatdValue(incident.CurCell_Provider) + "</span></div>";
	// TODO Use default value if RSSI value is -1. (Android API does not provide RSSI values.)
	popupText += "<div><span class='name'>RSSI: </span><span class='val'>" + incident.RSSI + "</span></div>";
	popupText += "<div><span class='name'>Lat: </span><span class='val'>" + incident.Lat + "</span></div>";
	popupText += "<div><span class='name'>Lng: </span><span class='val'>" + incident.Lng + "</span></div>";
	return popupText;
}

function getValidatdValue(value) {
	if (value == 'NULL' || value == null) {
		value = "n/a";
	}
	return value;
}

function getValidatedRSSIValue(value) {
	if (value == '-1' || value == -1) {
		value = -50;
	}
	return value;
}


// Interaction handlers -----------------------------------

map.on('zoomend', function(e) {
	//console.log("zoomend");

	// Update all markers according to current zoom level
	//updateMarkerSizes();
});

map.on('moveend', function(e) {
	//console.log("moveend");

	// Select Incident after zoom and pan animation
	var incidentMarker = markerArray[selectedIncidentMarkerIndex];
	
	if (incidentMarker && incidentMarker.animateToOveral) {
		setTimeout(function() {
			map.setView(incidentMarker._incident.latlng, settings.incidentZoomLevel);
			incidentMarker.animateToIncident = true;
		},800);
		
		incidentMarker.animateToOveral = false;
	}
	
	if (incidentMarker && incidentMarker.animateToIncident) {
		selectIncident(incidentMarker);
		incidentMarker.animateToIncident = false;
	}
});
	
map.on("mousemove", function(e) {
	delayMarkerAnimationOnInteraction();
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


// --------------------------------------------------------

function delayMarkerAnimationOnInteraction() {
	// Stops animation on user interaction
	clearInterval(markerAnimationTimer);
	clearTimeout(markerAnimationInteractionTimer);

	// And restarts after a while of non-interaction
	markerAnimationInteractionTimer = window.setTimeout(restartMarkerAnimation, settings.animationWaitInterval);
}

function restartMarkerAnimation() {
	if (settings.autoAnimation) {
		markerAnimationTimer = window.setInterval(gotoNextMarker, settings.animationInterval);
	}
}

function updateMarkerSizes() {
	markerArray.forEach(function(marker, index) {
		updateMarkerSize(marker);
	});
}

function updateMarkerSize(/* Marker */ marker) {
	// TODO Could be used for border adaptation and popup offset
	
	/*
	var dbFactor = marker._incident.RSSI / -100;
	var size = dbFactor * settings.incidentRadiusMeter * scale.pixelFactor;

	//marker._path.setAttribute("transform", "rotate("+frame+","+marker._point.x+","+marker._point.y+")");

	marker.setStyle({
	//	weight: size / 30
	})
	marker.setRadius(size);
	
	// Also update
	//updatePopupOffset(marker);
	*/
}

function gotoNextMarker() {
	//console.log("gotoNextMarker");
	
	lastIncidentMarkerIndex = selectedIncidentMarkerIndex;
	if (lastIncidentMarkerIndex == -1) {
		// Special case: First iteration
		lastIncidentMarkerIndex = 0;
	}

	selectedIncidentMarkerIndex++;
	if (selectedIncidentMarkerIndex >= markerArray.length) {
		selectedIncidentMarkerIndex = 0;

		// Reset all markers, infoboxes, and bumps
		resetAll();
	}

	var incidentMarker = markerArray[selectedIncidentMarkerIndex];
	animateToIncident(incidentMarker);
}

function resetAll() {
	// Set all markers to non bumped
	for (var i = 0; i < markerArray.length; i++) {
		markerArray[i]._isBumped = false;
	}
	
	// Reset all fully bumped country polygons
	// 1) Remove layer with all countries
	allCountriesLayer.clearLayers();
	// 2) Re-parse geoJson and add original, non-bumped country polygons to the map, anew
	addCountriesToMap(originalCollection);
	
	// NB If user manually selects an incident at the end of the timeline, and the animation goes to the next, 
	// rolls over, and this resetAll() is triggered, the user might not have seen all incidents. 
}

function selectIncident(/* Marker */ incidentMarker) {

	// reset last marker style
	var lastMarker = markerArray[lastIncidentMarkerIndex];
	lastMarker._bigCircle.setStyle({
		fillColor:'#FF4757',
		fillOpacity: 0.3
	});
	lastMarker._smallCircle.setStyle({
		fillColor:'#FF4757',
		fillOpacity: 0.3
	});
	lastMarker.setStyle({
		fillColor:'#FF4757',
		fillOpacity: 0.2
	});
	// set active marker style
	incidentMarker._bigCircle.setStyle({
		fillColor:'#FF0015',
		fillOpacity: 0.3
	});
	incidentMarker._smallCircle.setStyle({
		fillColor:'#FF0015',
		fillOpacity: 0.3
	})
	incidentMarker.setStyle({
		fillColor:'#FF0015', // FF0015
		fillOpacity: 0.3
	})

	if (!incidentMarker._isBumped) {
		// Bump the two countries of the incident
		setTimeout(function(){
			bumpCountries(
				incidentMarker._incident.LastMCC_CountryCode,
				incidentMarker._incident.CurMCC_CountryCode,
				incidentMarker._incident.latlng
			);

			// Do this only once
			incidentMarker._isBumped = true;
			
			// openPopup
			openIncidentPopup(incidentMarker);
			
		}, 1000);
	} else {
		//console.log("selectIncident > openIncidentPopup");
		openIncidentPopup(incidentMarker);
	}
}

function openIncidentPopup(/* Marker */ incidentMarker) {
	if (incidentMarker && settings.showInfoPopup) {
		//console.log("openpopup", incidentMarker)
		//incidentMarker._incidentCirle.openPopup();
		
		var incidentDiv = $('#i'+incidentMarker._index);
		var container = $('#incidentHistory');
		container.find('.active').removeClass('active');
		
		
		if (incidentDiv.length > 0) {
			incidentDiv.addClass('active')
			var elementOffset = incidentDiv.offset();
			var scrollTo = elementOffset.top - 210;
			container.scrollToPos(scrollTo, 500);
		} else {
			container.scrollToPos(0, 500);
			var incidentDiv = createPopupText(incidentMarker._incident);

			var itemOuter = $('<div>')
				.attr('id', 'i' + incidentMarker._index)
				.addClass('incidentOuter')
				.addClass('active')
				.prependTo(container)
				.animate({
					height: 140
				}, {
					duration: 1000,
					easing: "cubic-bezier(0.64, 0, 0.28, 1)"
				})
				.data('incidentIndex', incidentMarker._index)
				.on("click", function() {
					var index = $(this).data('incidentIndex');
					delayMarkerAnimationOnInteraction();
					lastIncidentMarkerIndex = selectedIncidentMarkerIndex;
					animateToIncident(markerArray[index]);
				})


			var itemInner = $('<div>')
				.addClass('incidentInner')
				.html(incidentDiv)
				.appendTo(itemOuter)
				.animate({
					top: 0
				}, {
					duration: 1000,
					easing: "cubic-bezier(0.64, 0, 0.28, 1)"
				})
		}
	

		$('#incidentHistory>div').each(function(index, item) {
			if (index > 30) $(item).remove();
		});
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
			markerArray[selectedIncidentMarkerIndex]._incidentCirle.closePopup();
		}
	}
	
	//lastIncidentMarkerIndex = selectedIncidentMarkerIndex;
	
	// Save index of marker for interaction selections (e.g. click on marker)
	selectedIncidentMarkerIndex = incidentMarker._index;

	// if(arguments[1]){
	// 	//start zoom direct
	// 	incidentMarker.animateToIncident = true;
	// 	map.setView(incidentMarker._incident.latlng, settings.IncidentZoomLevel);
	// }

	if (map.getCenter().equals(incidentMarker.getLatLng())) {
		// centered on marker
		selectIncident(incidentMarker);
	} else {
		//start animation
		incidentMarker.animateToIncident = true;
		map.setView(incidentMarker._incident.latlng, settings.incidentZoomLevel);
	}
}

function bumpCountries(/* String */ fromCountryCode, /* String */ toCountryCode, /* L.LatLng */ incidentLatLng) {
	//console.log("bumpCountries: from " + fromCountryCode + " to " + toCountryCode);

	// Bump only closest layer (not all)
	var fromCountryClosestLayer = findClosestLayer(fromCountryCode, incidentLatLng);
	var toCountryClosestLayer = findClosestLayer(toCountryCode, incidentLatLng);
	
	if (fromCountryClosestLayer != null && toCountryClosestLayer != null) {
		bumpCountryLayers(fromCountryClosestLayer, toCountryClosestLayer, incidentLatLng);
	}
	else {
		console.warn("Could not find layers for both countries: " + fromCountryCode + " to " + toCountryCode);
	}
}	

function findClosestLayer(/* String */ countryCode, /* L.LatLng */ pos) {
	var countryLayers = countryLayerMap[countryCode];
	if (!(countryLayers !== undefined)) {
		return null;
	}
	
	//console.log("countryLayers: " + countryLayers);
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

	// TODO Use only points in bounding box (as in v0.5, but seems to be not necessary)


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
	var tempCountryPolyline = new L.Polyline(originalLatLngs, {color: 'black', opacity: 0.7, weight: 3, dashArray:'5,15', fill: false, smoothFactor: 0}).addTo(map);

	//console.log(tempCountryPolyline)
	// Bump border around the incident
	transformPoints(countryLatLngs, bumpVectors);

	// Create bumped SVG data (based on now bumped countryLatLngs)
	var tempTargetPolyline = new L.Polyline(originalLatLngs, {color: 'blue', opacity: 0, weight: 2, fill: false, smoothFactor: 0}).addTo(map);
	var targetSVGData = tempTargetPolyline._path.getAttribute('d');

	// Transition from temp country polyline to bumped polyline
	//console.log("starting transition...");
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
