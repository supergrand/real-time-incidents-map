var MsgComposer = (function() {

  var fontAwesome = {
    'default' : 'fa fa-circle',
    'success' : 'fa fa-check-circle',
    'info'    : 'fa fa-info-circle',
    'error'   : 'fa fa-times-circle',
    'alert'   : 'fa fa-exclamation-triangle',
  };

  function Message() {
    this.id = "";
    this.type = "alert";
    this.content = 'Empty message';
    this.classNames = [];
    this.info = [];
  }

  Message.prototype.setId = function(id) {
    this.id = id;
    return this;
  };

  Message.prototype.getId = function() {
    return this.id;
  };

  Message.prototype.setType = function(type) {
    this.type = type;
    return this;
  };

  Message.prototype.getTypeIcon = function() {
    if(fontAwesome[this.type]) return fontAwesome[this.type];
    return fontAwesome['default'];
  };

  Message.prototype.addClass = function(className) {
    this.classNames.push(className);
    return this;
  };

  Message.prototype.getClassString = function() {
    var strClass = '';
    for(var i in this.classNames) {
      strClass += " " + this.classNames[i];
    }
    return strClass;
  };

  Message.prototype.setContent = function(content) {
    this.content = content;
    return this;
  };

  Message.prototype.getContent = function() {
    return this.content;
  };

  Message.prototype.addInfo = function(key, value) {
    this.info.push({
      key: key,
      value: value,
    });
    return this;
  };

  Message.prototype.getInfo = function() {
    return this.info;
  };

  Message.prototype.toHTML = function() {
    result =  '<li class="msg ' + this.getClassString() + '" id="' + this.id + '">';
    result += '  <h1><i class="' + this.getTypeIcon() + '"></i> ' + this.content + '</h1>';

    if(this.info.length > 0) {
      result += '  <div class="info">';
      for(var i in this.info) {
        var info = this.info[i];
        result += '    <div class="cell"><i class="' + info.key + '"></i> ' + info.value + '</div>';
      }
      result += '  </div>';
    }

    result += '</li>';
    return result;
  };

  return {
    createMessage: function(content, type) {
      var message = new Message();

      if(content) {
        message.setContent(content);
      }
      if(type) {
        message.setType(type);
      }

      return message;
    },
  };
})();


var IncidentMsgComposer = (function(parent) {

  var alz = function(num) {
    return (num < 10) ? '0' + num : '' + num;
  };

  var DDToDMS = function(dd) {
    var deg = Math.floor(dd);
    var minFloat = (dd - deg) * 60;
    var min = Math.floor(minFloat);
    var secFloat = (minFloat - min) * 60;
    var sec = Math.round(secFloat);

    if(sec == 60) { min += 1; sec = 0; }
    if(min == 60) { deg += 1; min = 0; }

    return alz(deg) + "&deg; " + alz(min) + "' " + alz(sec) + '"';
  };

  var formatCoordinates = function(lonlat) {
    var lon = DDToDMS(lonlat[0]);
    var lat = DDToDMS(lonlat[1]);
    return lat + ' ' + lon;
  };

  var formatDate = function(timestamp) {

    // TODO: IncidentMsgComposer.formatDate(dateStr)

    return timestamp;
  };

  return {
    createMessage: function(geoJson) {
      var id = geoJson.id;
      var content = geoJson.properties.name;
      var date = formatDate(geoJson.properties.occurred_at);
      var coordinates = formatCoordinates(geoJson.geometry.coordinates);

      var message = parent
        .createMessage(content, 'alert')
        .setId(id)
        .addClass('incident')
        .addInfo('fa fa-clock-o', date)
        .addInfo('fa fa-map-marker', coordinates);
      return message;
    }
  };
})(MsgComposer);


var Application = (function() {

  var ws;
  var map;
  var incidentsSource;

  var tmpMessages = [];
  var $msgStack = $('.msg-stack');

  var $online = $('#status-online');
  var $offline = $('#status-offline');

  var pushMessages = function(messages) {
    var html = '';
    for(var i in messages) {
      html += messages[i].toHTML();
    }
    $msgStack.prepend(html).children('.msg').click(incidentMessageClicked);
    tmpMessages = [];
  };

  var switchStatus = function(connected) {
    if(connected === true) {
      $offline.hide();
      $online.show();
    } else {
      $online.hide();
      $offline.show();
    }
  };

  var toGeoJson = function(ol3Feature) {
    var coorinates = ol3Feature.getGeometry().getCoordinates();
        coorinates = ol.proj.transform(coorinates, 'EPSG:3857', 'EPSG:4326');

    var geojsonFeature = {
      type: 'Feature',
      id: ol3Feature.getId(),
      geometry: {
        type: 'Point',
        coordinates: coorinates,
      },
      properties: {
        name: ol3Feature.get('name'),
        occurred_at: ol3Feature.get('occurred_at'),
      },
    };

    return geojsonFeature;
  };

  var addGeoJsonFeature = function(data) {
    // Create a point
    var point = new ol.geom.Point(
      ol.proj.transform(
        data.feature.coordinates,
        'EPSG:4326',
        'EPSG:3857'
      )
    );

    // Create a feature
    var feature = new ol.Feature({
      geometry: point,
      uuid: data.uuid,
      name: data.name,
      occurred_at: data.occurred_at,
    });

    // Set an ID of the feature
    feature.setId(data.uuid);

    // Add the feature to the layer
    incidentsSource.addFeature(feature);
  };

  var removeFeature = function(uuid) {
    var feature = incidentsSource.getFeatureById(uuid);
    if(feature) {
      incidentsSource.removeFeature(feature);
    }
  };

  var initializeMap = function() {
    // Open Street Map as a background
    var osmLayer = new ol.layer.Tile({
      source: new ol.source.OSM(),
    });

    // Create a View
    var view = new ol.View({
      center: ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:3857'),
      zoom: 2,
      minZoom: 2,
      maxZoom: 19,
    });

    // Create a Map
    map = new ol.Map({
      target: "map",
      layers: [osmLayer],
      view: view,
    });
  };

  var initializeWebSocket = function() {

    if("WebSocket" in window) {
      ws = new WebSocket('ws://localhost:8888/ws/notifications/');

      ws.onopen = function(e) {
        ws.send('hello');
        switchStatus(true);
      };

      ws.onerror = function(e) {
        console.error(e.data);
      };

      ws.onclose = function(e) {
        switchStatus(false);
      };

      ws.onmessage = function(e) {
        var msg = $.parseJSON(e.data);

        // Dispatch
        switch(msg.operation) {
          case 'insert':
            handleInsert(msg.uuid);
            break;
          case 'update':
            handleUpdate(msg.uuid);
            break;
          case 'delete':
            handleDelete(msg.uuid);
            break;
          default:
            console.log('Meow!');
        }
      };
    }
  };

  var handleInsert = function(uuid) {
    $.ajax({dataType: "json", url: '/incidents/' + uuid, success: addGeoJsonFeature});
  };

  var handleUpdate = function(uuid) {
    removeFeature(uuid);
    $.ajax({dataType: "json", url: '/incidents/' + uuid, success: addGeoJsonFeature});
  };

  var handleDelete = function(uuid) {
    removeFeature(uuid);
  };

  var initializeIncidentsLayer = function() {

    var mapProjection = map.getView().getProjection();

    // Source of incidents
    incidentsSource = new ol.source.GeoJSON({
        'projection': mapProjection,
        'url': '/incidents',
    });

    // Create a style for the layer
    var incidentStyle = new ol.style.Style({
      image: new ol.style.Circle({
        fill:new ol.style.Fill({color: 'yellow'}),
        stroke: new ol.style.Stroke({color: 'black', width: 1}),
        radius: 5
      }),
    });

    // Create a layer
    var incidentsLayer = new ol.layer.Vector({
      source: incidentsSource,
      style: incidentStyle,
    });

    // Add event handlers
    incidentsSource.on('addfeature', incidentAdded);
    incidentsSource.on('change', incidentsLayerChanged);
    incidentsSource.on('removefeature', incidentRemoved);

    // Add the layer to the map
    map.addLayer(incidentsLayer);
  };

  var incidentAdded = function(e) {
    var message = IncidentMsgComposer
      .createMessage(toGeoJson(e.feature))
      .addClass('new');

    tmpMessages.push(message);
  };

  var incidentsLayerChanged = function(e) {
    var sourceState = e.target.getState();
    if(sourceState === "ready") {
      if(tmpMessages) {
        pushMessages(tmpMessages);
      }
    }
  };

  var incidentRemoved = function(e) {
    var id = e.feature.getId();
    $('#' + id).hide();
  };

  var incidentMessageClicked = function(e) {
    // Remove the yellow highlight on new
    if($(this).hasClass('new')) {
        $(this).removeClass('new');
    }

    // Get the ID of the clicked item
    var id = $(this).attr('id');

    if(id) {
      // Get the feature by ID
      var feature = incidentsSource.getFeatureById(id);

      if(feature) {
        // If the feature was found, zoom to it
        var featureExtent = feature.getGeometry().getExtent();
        map.getView().fitExtent(featureExtent, map.getSize());
      }
    }
  };

  // Fit all features on the map view
  $('#show-all-features').click(function(e) {
    var incidentsExtent = incidentsSource.getExtent();
    map.getView().fitExtent(incidentsExtent, map.getSize());
  });

  return {
    init: function() {
      initializeMap();
      initializeIncidentsLayer();
      initializeWebSocket();
    }
  };
})();

Application.init();
