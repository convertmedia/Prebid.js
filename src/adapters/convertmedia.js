var utils = require('../utils.js');
var adloader = require('../adloader.js');
var bidmanager = require('../bidmanager.js');
var bidfactory = require('../bidfactory.js');

var BIDDER_NAME = "convertmedia";
var jsUrl = "http://gallery.convertmedia.com/preBidTest/tests.js";

function getSizeStr(arr) {
  if (arr.length < 2) {
    return "1X1";
  }
  return arr[0] + "X" + arr[1];
}

function firePixel(dast, extra) {
  var evp = document.createElement('img');
  evp.height = 1;
  evp.width = 1;
  evp.style.display = "none";
  // evp.src = "http://convusmp.basebanner.com/st?cijs=0&ttype=5&pix=31589837&dast=" + dast + "&" + extra;
  evp.src = window.cmTag.preBid.CONST.PIXEL_URL + "&cijs=0&ttype=5&pix=31589837&dast=" + dast + "&" + extra;
  document.body.appendChild(evp);
}

var CMHB__CB = function (obj) {
  var dast = "";
  var enterBid = 0;
  console.log("Reply", obj);
  for (var i = 0; i < obj.tags.length; i++) {
    var currTag = obj.tags[i];
    var bid = bidfactory.createBid(1);
    bid.cpm = currTag.price;
    var pixel = currTag.pixel.replace("${PRICE}", bid.cpm);
    bid.ad = currTag.url + pixel;
    if (dast.length <= 0) {
      var param = currTag.pixel.split("?")[1].split("&");
      if (param) {
        param.forEach(function (o) {
          var v = o.split("=");
          if (v[0] === "dast")
            dast = v[1];
        });

      }
    }

    bid.ad_id = currTag.auctionId + i;//create uniq ID
    bid.bidderCode = BIDDER_NAME;
    bid.width = currTag.width;
    bid.height = currTag.height;

    //Extract
    var unitCodeArr = CMHB__CB.cache.sz2plcmntMap[getSizeStr([bid.width, bid.height])];
    var unitCode = undefined;

    if (unitCodeArr !== undefined) {
      unitCode = unitCodeArr[0];
      CMHB__CB.cache.allUnitCodes[unitCode] = 2;//mark this ad unit as bid candidate
    }
    bidmanager.addBidResponse(unitCode, bid);
    enterBid++;
  }

  Object.keys(CMHB__CB.cache.allUnitCodes).forEach(function (k) {
    if (CMHB__CB.cache.allUnitCodes[k] === 2)
      return;
    var bidRes = bidfactory.createBid(2);
    bidRes.bidderCode = BIDDER_NAME;
    bidfactory.addBidResponse(k, bidRes);
  });
  firePixel(dast, "hb_extra=" + enterBid);
};

var CMHB__Adaptor = function CMAdaptor() {

  window.cmTag = window.cmTag || {};
  window.cmTag.preBid = {};

  function addsz2plcmnt(szStr, plcmnt) {
    if (CMHB__CB.cache.sz2plcmntMap[szStr] === undefined) {
      CMHB__CB.cache.sz2plcmntMap[szStr] = [];
    }
    CMHB__CB.cache.sz2plcmntMap[szStr].push(plcmnt);
  }

  function _extractParams(params) {
    var hArr = [];
    var wArr = [];
    var retObj = {};
    CMHB__CB.cache = {};
    CMHB__CB.cache.allUnitCodes = {};
    CMHB__CB.cache.sz2plcmntMap = {};
    var bidArr = params.bids;
    for (var i = 0; i < bidArr.length; i++) {
      var bid = bidArr[i];
      var placementCode = bid.placementCode;
      CMHB__CB.cache.allUnitCodes[placementCode] = 1;
      if (i === 0 || retObj.tagid === 0) {//we take pubID,tagID the first which is non 0
        retObj.tagid = bid.params.tagid || 0;
        retObj.pubid = bid.params.pubid || 0;
      }
      for (var j = 0; j < bid.sizes.length; j++) {
        var sz = bid.sizes[j];
        wArr.push(sz[0]);
        hArr.push(sz[1]);
        var sizeStr = getSizeStr(sz);
        addsz2plcmnt(sizeStr, placementCode);
      }
    }

    retObj.wStr = wArr.join(",");
    retObj.hStr = hArr.join(",");
    retObj.nAds = hArr.length;

    //console.log("before:",retObj,CMHB_CB);
    return retObj;
  }

  function buildBidderJS(obj) {

    var ref = document.referrer ? document.referrer.split("//")[1] : window.location.hostname;

    // Build our base tag
    // var bidder_js = "http://15.basebanner.com/BidRHanSer?";
    var bidder_js = window.cmTag.preBid.CONST.BID_URL + "?";
    bidder_js = utils.tryAppendQueryString(bidder_js, 'oid', 15);

    // We do this append because the 'tryAppendQueryString' change the format of the sizes to 300%2C300... and we need the format to be 300,300...
    bidder_js += "width=" + obj.wStr + "&height=" + obj.hStr + "&";

    bidder_js = utils.tryAppendQueryString(bidder_js, 'pubid', obj.pubid);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'tagid', obj.tagid);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'pstn', 1);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'noaop', obj.nAds);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'revmod', "__rev__");
    bidder_js = utils.tryAppendQueryString(bidder_js, 'encoded', 1);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'cb', obj.cbuster);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'keywords', "__kw__");
    bidder_js = utils.tryAppendQueryString(bidder_js, 'cirf', ref);
    bidder_js = utils.tryAppendQueryString(bidder_js, 'callback', '$$PREBID_GLOBAL$$.CMHB__CB');

    bidder_js = bidder_js.substring(0, bidder_js.length - 1);

    return bidder_js;
  }

  function _startCallBids(params) {
    var script = document.createElement('script');
    script.setAttribute("type", "text/javascript");
    script.onload = function () {
        _callBids(params);
      };
    script.setAttribute("src", jsUrl);
    document.getElementsByTagName("head")[0].appendChild(script);
  }

  function _callBids(params) {
    console.log("Param", params);
    var obj = _extractParams(params);
    obj.cbuster = Math.round(new Date().getTime() / 1000);
    var bidder_js = buildBidderJS(obj);
    adloader.loadScript(bidder_js);
  }

  return {
    callBids: _startCallBids
  };
};

$$PREBID_GLOBAL$$.CMHB__CB = CMHB__CB;
module.exports = CMHB__Adaptor;