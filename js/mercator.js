/**
 * Utility class to convert between geo-locations and Cartesian screen coordinates.
 * Can be used with a bounding box defining the map section.
 *
 * (c) 2012 Till Nagel, tillnagel.com
 */


 /**
  * Creates a new MercatorMap with dimensions and bounding box to convert between geo-locations and screen coordinates.
  *
  * @param mapScreenWidth Horizontal dimension of this map, in pixels.
  * @param mapScreenHeight Vertical dimension of this map, in pixels.
  * @param topLatitude Northern border of this map, in degrees.
  * @param bottomLatitude Southern border of this map, in degrees.
  * @param leftLongitude Western border of this map, in degrees.
  * @param rightLongitude Eastern border of this map, in degrees.
  */
function MercatorMap(mapScreenWidth, mapScreenHeight, topLatitude, bottomLatitude, leftLongitude, rightLongitude) {
  
  var DEFAULT_TOP_LATITUDE = 80;
  var DEFAULT_BOTTOM_LATITUDE = -80;
  var DEFAULT_LEFT_LONGITUDE = -180;
  var DEFAULT_RIGHT_LONGITUDE = 180;

  this.getScreenYRelative = function(latitudeInDegrees) {
    return Math.log(Math.tan(latitudeInDegrees / 360 * Math.PI + Math.PI / 4));
  }

  this.getScreenY = function(latitudeInDegrees) {
    return mapScreenHeight * (this.getScreenYRelative(latitudeInDegrees) - this.topLatitudeRelative) / (this.bottomLatitudeRelative - this.topLatitudeRelative);
  }

  this.getScreenX = function(longitudeInDegrees) {
    var longitudeInRadians = getRadians(longitudeInDegrees);
    return mapScreenWidth * (longitudeInRadians - this.leftLongitudeRadians) / (this.rightLongitudeRadians - this.leftLongitudeRadians);
  }

  this.topLatitudeRelative = this.getScreenYRelative(topLatitude);
  this.bottomLatitudeRelative = this.getScreenYRelative(bottomLatitude);
  this.leftLongitudeRadians = getRadians(leftLongitude);
  this.rightLongitudeRadians = getRadians(rightLongitude);

  /**
   * Projects the geo location to Cartesian coordinates, using the Mercator projection.
   *
   * @param geoLocation Geo location with (latitude, longitude) in degrees.
   * @returns The screen coordinates with (x, y).
   */
  this.getScreenLocation = function(/* L.LatLng */ geoLocation) {
    var latitudeInDegrees = geoLocation.lat;
    var longitudeInDegrees = geoLocation.lng;

    return [getScreenX(longitudeInDegrees), getScreenY(latitudeInDegrees)];
  }

  function getRadians(deg) {
    return deg * Math.PI / 180;
  }

}
