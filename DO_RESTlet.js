/**
 * @NApiVersion 2.x
 * @NScriptType Restlet
 */
define(['N/search'], function (search) {

  function doGet(params) {
    var results = [];

    var now = new Date();
    var oneHourAgo = new Date(now.getTime() - (60 * 60 * 1000));

    var soSearch = search.create({
      type: "salesorder",
      filters: [
        ["otherrefnum", "isnotempty", ""], "AND",
        ["lastmodifieddate", "onorafter", oneHourAgo.toISOString()]
      ],
      columns: [
        "tranid", "trandate", "otherrefnum",
        "custbody_do_date", "location", "entity", "department"
      ]
    });

    soSearch.run().each(function (result) {
      results.push({
        salesOrderNumber: result.getValue("tranid"),
        salesOrderDate: result.getValue("trandate"),
        deliveryOrderNumber: result.getValue("otherrefnum"),
        deliveryOrderDate: result.getValue("custbody_do_date"),
        warehouseLocation: result.getText("location"),
        customerName: result.getText("entity"),
        division: result.getText("department"),
      });
      return true;
    });

    return results;
  }

  return { get: doGet };
});