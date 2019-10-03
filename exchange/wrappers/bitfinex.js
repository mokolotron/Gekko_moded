
const Bitfinex = require("bitfinex-api-node");
const _ = require('lodash');
const moment = require('moment');



const Errors = require('../exchangeErrors');
const retry = require('../exchangeUtils').retry;

const marketData = require('./bitfinex-markets.json');

var Trader = function(config) {

  _.bindAll(this);
  if(_.isObject(config)) {
    this.key = config.key;
    this.secret = config.secret;
  }
  this.name = 'Bitfinex';
  this.balance;
  this.price;
  this.asset = config.asset;
  this.currency = config.currency;
  this.pair = this.asset + this.currency;
  this.bitfinex = new Bitfinex.RESTv1({apiKey: this.key, apiSecret: this.secret, transform: true});

  this.interval = 4000;
}

const includes = (str, list) => {
  if(!_.isString(str))
    return false;

  return _.some(list, item => str.includes(item));
}

const recoverableErrors = [
  'SOCKETTIMEDOUT',
  'ESOCKETTIMEDOUT',
  'TIMEDOUT',
  'CONNRESET',
  'CONNREFUSED',
  'NOTFOUND',
  '443',
  '504',
  '503',
  '502',
  'Empty response',
  'Nonce is too small'
]

Trader.prototype.checkTradingPosition = function()
{

};

Trader.prototype.getPositionAmount =  function () {
return promise = new Promise((resolve, rejected) => {
  console.log('BITFINEX GET POS AMOUNT');
  // if(from === "from_broker"){
  //   if(this.rest_request > ){
  //
  //   }
  // }
  //let amount = null;

  this.bitfinex.active_positions((err, res) => {
    if (err) {
      rejected("Error in getPosAmount", err);
      console.log(err);
    }

    else console.log("Well DONE", res);
    try {
      res.forEach((elem) => {
        console.log(elem);
        if (this.pair.toLowerCase().localeCompare(elem.symbol) === 0)
          this.pos_amount = elem.amount;
      });
    } catch (e) {
      console.log("why I there???");
      rejected(null);
      //console.log(err);
    }

    //  console.log(this.position_amount);
    if (this.pos_amount === 0)
      this.exposed2 = 0; //without
    else if (this.pos_amount > 0)
      this.exposed2 = 1; //long
    else if (this.pos_amount < 0)
      this.exposed2 = -1; //short
    else
      this.exposed2 = null;


    const exposed2 = this.exposed2;
    const pos_amount = this.pos_amount;
    //console.log(this.portfolio);
    // console.log('!!!!!!!', this.portfolio);
    console.log('Bitfinex EXPOSED_NEW',exposed2,pos_amount);////
    resolve({exposed2, pos_amount});
    // return amount;
    // Trader.pos_amount = amount ;
    // if (this.position_amount > 0)
    //   this.side = 'sell';
    // else
    //   this.side = 'buy';
    //
    // console.log('close' ,this.position_amount, this.pair.toLowerCase(), this.side, res);
  })

})

};


Trader.prototype.closePosition = function(exposed2, pos_amount){
  let side = null;
  let price = null;

  //this.position_amount = this.getPositionAmount();
  //console.log(this.setBalance);
  //this.exposed2 = this.setBalance();
  //console.log(this.exposed2);
   //const order_amount = this.getPositionAmount();
   if(exposed2 === 0||exposed2 === null) { //If we havnt setBalance try again

     console.log("Nothing to CLOSE");
     return 0;
    // this.setBalance();
   }
   else if(exposed2 === 1) {
     side = "sell";
     //(pos_amount *= -1).toFixed(10);
     price = 0.1;

     }
   else if(exposed2 === -1) {
     side = "buy";
     (pos_amount *= -1).toFixed(10);
     price = 10000000;
   }


  // console.log("pos_amount Start",pos_amount);
  // console.log("pos_amount Start to fixed", parseFloat(pos_amount).toFixed(10));

   console.log("close POSITION PARAMERTS", pos_amount, side, price);

   // Э ідея записувати 10000 коли хочем закрити шорт і  0.0000001 коли закрити лонг///////

   /////
     const showResult = (err, result) => {console.log("Close POSITION RESULT", err, result)};
     this.submitOrder(side, pos_amount , parseFloat(price), showResult, 'market');
    //this.bitfinex.new_order(this.pair.toLowerCase(), Math.abs(this.position_amount), )
    // console.log('close');
};

Trader.prototype.handleResponse = function(funcName, callback) {
  return (error, data) => {

    if(!error && _.isEmpty(data)) {
      error = new Error('Empty response');
    }

    if(error) {
      const message = error.message;

      console.log('handleResponse', funcName, message);

      // in case we just cancelled our balances might not have
      // settled yet, retry.
      if(
        funcName === 'submitOrder' &&
        message.includes('not enough exchange balance')
      ) {
        error.retry = 20;
        return callback(error);
      }

      // most likely problem with v1 api
      if(
        funcName === 'submitOrder' &&
        message.includes('Cannot evaluate your available balance, please try again')
      ) {
        error.retry = 10;
        return callback(error);
      }

      // in some situations bfx returns 404 on
      // orders created recently
      if(
        funcName === 'checkOrder' &&
        message.includes('Not Found')
      ) {
        error.retry = 5;
        return callback(error);
      }

      if(includes(message, recoverableErrors)) {
        error.notFatal = true;
        return callback(error);
      }

      if(includes(message, 'Too Many Requests')) {
        error.notFatal = true;
        error.backoffDelay = 5000;
      }
    }

    return callback(error, data);
  }
};

Trader.prototype.getPortfolio = function(callback) {
  console.log('////',this.bitfinex);
  const processResponse = (err, data) => {
    if (err) return callback(err);

    // We are only interested in funds in the "MARGIN" wallet
    const leverage = 2;
    data = data.filter(c => c.type === 'trading');
    ////multiply balance by 2 to take a leverage
    data = data.map((obj)=> {
      nobj = obj;
      nobj.amount = obj.amount*leverage;
      nobj.available = obj.available*leverage;
      return nobj;
    });

    const asset = _.find(data, c => c.currency.toUpperCase() === this.asset);
    const currency = _.find(data, c => c.currency.toUpperCase() === this.currency);

    let assetAmount, currencyAmount;

    if(_.isObject(asset) && _.isNumber(+asset.available) && !_.isNaN(+asset.available))
      assetAmount = +asset.available;
    else {
      assetAmount = 0;
    }

    if(_.isObject(currency) && _.isNumber(+currency.available) && !_.isNaN(+currency.available))
      currencyAmount = +currency.available;
    else {
      currencyAmount = 0;
    }


   // this.broker.portfolio.balances.push({currency_now: currency.available});
    const portfolio = [
      { name: this.asset, amount: assetAmount,  },
      { name: this.currency, amount: currencyAmount, aviable: currency.amount },
      ];
   //// console.log(assetAmount, currencyAmount,  portfolio, currency, asset, data );////
    callback(undefined, portfolio);
  };

  const fetch = cb => this.bitfinex.wallet_balances(this.handleResponse('getPortfolio', cb));
  retry(null, fetch, processResponse);
};

Trader.prototype.getTicker = function(callback) {
  const processResponse = (err, data) => {
    if (err)
      return callback(err);

    callback(undefined, {bid: +data.bid, ask: +data.ask});
  };

  const fetch = cb => this.bitfinex.ticker(this.pair, this.handleResponse('getTicker', cb));
  retry(null, fetch, processResponse);
}

Trader.prototype.getFee = function(callback) {
  const makerFee = 0.1;
  // const takerFee = 0.2;
  callback(undefined, makerFee / 100);
}

Trader.prototype.roundAmount = function(amount) {
  return Math.floor(amount*100000000)/100000000;
}

Trader.prototype.roundPrice = function(price) {
  // todo: calc significant digits
  return price;
}

Trader.prototype.submitOrder = function(side, amount, price, callback, type) {
  const processResponse = (err, data) => {
    //console.log(data);

    if (err)
      return callback(err);

    callback(null, data.order_id);
  };

  console.log(price, )

  const fetch = cb => this.bitfinex.new_order(this.pair,
    amount + '',
    price + '',
    this.name.toLowerCase(),
    side,
    type,
   // 'exchange limit',
    this.handleResponse('submitOrder', cb)
  );

  retry(null, fetch, processResponse);
}

Trader.prototype.buy = function(amount, price, callback) {
  this.submitOrder('buy', amount, price, callback, 'market');
}

Trader.prototype.sell = function(amount, price, callback) {
  this.submitOrder('sell', amount, price, callback, 'market');
}

Trader.prototype.checkOrder = function(order_id, callback) {
  const processResponse = (err, data) => {
    if (err) {
      console.log('this is after we have retried fetching it');
      // this is after we have retried fetching it
      // in this.handleResponse.
      if(err.message.includes('Not Found')) {
        return callback(undefined, {
          open: false,
          executed: true
        });
      }

      return callback(err);
    }

    return callback(undefined, {
      open: data.is_live,
      executed: data.original_amount === data.executed_amount,
      filledAmount: +data.executed_amount
    });
  }

  const fetcher = cb => this.bitfinex.order_status(order_id, this.handleResponse('checkOrder', cb));
  retry(null, fetcher, processResponse);
}


Trader.prototype.getOrder = function(order_id, callback) {
  const processResponse = (err, data) => {
    if (err) return callback(err);

    var price = parseFloat(data.avg_execution_price);
    var amount = parseFloat(data.executed_amount);
    var date = moment.unix(data.timestamp);

    console.log('getOrder', data);

    // TEMP: Thu May 31 14:49:34 CEST 2018
    // the `past_trades` call is not returning
    // any data.
    return callback(undefined, {price, amount, date});

    const processPastTrade = (err, data) => {
      if (err) return callback(err);

      console.log('processPastTrade', data);
      const trade = _.first(data);

      const fees = {
        [trade.fee_currency]: trade.fee_amount
      }

      callback(undefined, {price, amount, date, fees});
    }

    // we need another API call to fetch the fees
    const feeFetcher = cb => this.bitfinex.past_trades(this.currency, {since: data.timestamp}, this.handleResponse('pastTrades', cb));
    retry(null, feeFetcher, processPastTrade);

    callback(undefined, {price, amount, date});
  };

  const fetcher = cb => this.bitfinex.order_status(order_id, this.handleResponse('getOrder', cb));
  retry(null, fetcher, processResponse);
}


Trader.prototype.cancelOrder = function(order_id, callback) {
  const processResponse = (err, data) => {
    if (err) {
      return callback(err);
    }

    return callback(undefined, false);
  }

  const handler = cb => this.bitfinex.cancel_order(order_id, this.handleResponse('cancelOrder', cb));
  retry(null, handler, processResponse);
}

Trader.prototype.getTrades = function(since, callback, descending) {
  const processResponse = (err, data) => {
    if (err) return callback(err);

    var trades = _.map(data, function(trade) {
      return {
        tid: trade.tid,
        date:  trade.timestamp,
        price: +trade.price,
        amount: +trade.amount
      }
    });

    callback(undefined, descending ? trades : trades.reverse());
  };

  var path = this.pair;
  if(since)
    path += '?limit_trades=2000';

  const handler = cb => this.bitfinex.trades(path, this.handleResponse('getTrades', cb));
  retry(null, handler, processResponse);
}

Trader.getCapabilities = function () {
  return {
    name: 'Bitfinex',
    slug: 'bitfinex',
    currencies: marketData.currencies,
    assets: marketData.assets,
    markets: marketData.markets,
    requires: ['key', 'secret'],
    tid: 'tid',
    providesFullHistory: true,
    providesHistory: 'date',
    tradable: true,
    forceReorderDelay: true,
    gekkoBroker: 0.6
  };
}

module.exports = Trader;


