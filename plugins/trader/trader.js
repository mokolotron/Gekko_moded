const _ = require('lodash');
const util = require('../../core/util.js');
const config = util.getConfig();
const dirs = util.dirs();
const moment = require('moment');
const bitfinex = require("bitfinex-api-node");

const log = require(dirs.core + 'log');
const Broker = require(dirs.broker + '/gekkoBroker');

require(dirs.gekko + '/exchange/dependencyCheck');

const Trader = function(next) {

  _.bindAll(this);

  this.brokerConfig = {
    ...config.trader,
    ...config.watch,
    private: true
  }

  this.propogatedTrades = 0;
  this.propogatedTriggers = 0;

  try {
    this.broker = new Broker(this.brokerConfig);
  } catch(e) {
    util.die(e.message);
  }

  if(!this.broker.capabilities.gekkoBroker) {
    util.die('This exchange is not yet supported');
  }

  this.sync(() => {
    log.info('\t', 'Portfolio:');
    log.info('\t\t', this.portfolio.currency, this.brokerConfig.currency);
    log.info('\t\t', this.portfolio.asset, this.brokerConfig.asset);
    log.info('\t', 'Balance:');
    log.info('\t\t', this.balance, this.brokerConfig.currency);
    log.info('\t', 'Exposed:');
    log.info('\t\t',
      this.exposed ? 'yes' : 'no',
      `(${(this.exposure * 100).toFixed(2)}%)`
    );
    next();
  });

  this.cancellingOrder = false;
  this.sendInitialPortfolio = false;

  setInterval(this.sync, 1000 * 60 * 10);
}

// teach our trader events
util.makeEventEmitter(Trader);

Trader.prototype.sync = async function(next) {
  log.debug('syncing private data');
  this.broker.syncPrivateData(() => {
    console.log('Im here 61');
    if(!this.price) {

      this.price = this.broker.ticker.bid;
    }

    const oldPortfolio = this.portfolio;

    this.setPortfolio();
    this.setBalance();

    if(this.sendInitialPortfolio && !_.isEqual(oldPortfolio, this.portfolio)) {
      log.debug('Debug here: 71');
      this.relayPortfolioChange();
    }
    log.debug('Debug here: 74');
    // balance is relayed every minute
    // no need to do it here.

    if(next) {
      next();
    }
  });
}

Trader.prototype.relayPortfolioChange = function() {
  this.deferredEmit('portfolioChange', {
    asset: this.portfolio.asset,
    currency: this.portfolio.currency
  });
}

Trader.prototype.relayPortfolioValueChange = function() {
  this.deferredEmit('portfolioValueChange', {
    balance: this.balance
  });
}

Trader.prototype.setPortfolio = function() {
  this.portfolio = {
    currency: _.find(
      this.broker.portfolio.balances,
      b => b.name === this.brokerConfig.currency
    ).amount,
    asset: _.find(
      this.broker.portfolio.balances,
      b => b.name === this.brokerConfig.asset
    ).amount,
    // currency_all: _.find(
    //   this.broker.portfolio.balances,
    //   b => b.name === this.brokerConfig.currency
    // ).aviable,
  }
};



Trader.prototype.setBalance = function() {
  this.balance = this.portfolio.currency + this.portfolio.asset * this.price;
  this.exposure = (this.portfolio.asset * this.price) / this.balance;

  // if more than 10% of balance is in asset we are exposed
  this.exposed = this.exposure > 0.1;
};

Trader.prototype.processCandle = function(candle, done) {
  this.price = candle.close;
  const previousBalance = this.balance;
  this.setPortfolio();
  this.setBalance();

  if(!this.sendInitialPortfolio) {
    this.sendInitialPortfolio = true;
    this.deferredEmit('portfolioChange', {
      asset: this.portfolio.asset,
      currency: this.portfolio.currency
    });
  }

  if(this.balance !== previousBalance) {
    // this can happen because:
    // A) the price moved and we have > 0 asset
    // B) portfolio got changed
    this.relayPortfolioValueChange();
  }

  done();
}

Trader.prototype.processAdvice =  function(advice) {
  let direction;

  if(advice.recommendation === 'long') {
    direction = 'buy';
  } else if(advice.recommendation === 'short') {
    direction = 'sell';
  }else if(advice.recommendation === 'close') {  //// else if(close) add other type advise as close
    direction = 'close';
  }
  else {

    log.error('ignoring advice in unknown direction');
    return;
  }

  const id = 'trade-' + (++this.propogatedTrades);

  if(this.order) {
    if(this.order.side === direction) {
      return log.info('ignoring advice: already in the process to', direction);
    }

    if(this.cancellingOrder) {
      return log.info('ignoring advice: already cancelling previous', this.order.side, 'order');
    }

    log.info('Received advice to', direction, 'however Gekko is already in the process to', this.order.side);
    log.info('Canceling', this.order.side, 'order first');
    return this.cancelOrder(id, advice, () => this.processAdvice(advice));
  }

  //let amount;
//this.exposed2 = null;
// while(this.exposed2 === null){
//   setTimeout(()=>{this.exposed2 = this.broker.checkTradingPosition();  console.log(this.exposed2);} , 1000)  ;
// }
  this.broker.checkTradingPosition().then(({exposed2, pos_amount}) => {
    console.log({exposed2, pos_amount});

    if(direction === 'buy') {

      if (this.exposed2 === 1) {
        log.info('NOT buying, already exposed');
        return this.deferredEmit('tradeAborted', {
          id,
          adviceId: advice.id,
          action: direction,
          portfolio: this.portfolio,
          balance: this.balance,
          reason: "Portfolio already in position."
        });
      }

      ////TODO close position and buy
      this.broker.closePosition(exposed2, pos_amount);

      amount = this.portfolio.currency / this.price * 0.95;

      log.info(
        'Trader',
        'Received advice to go long.',
        'Buying ', this.brokerConfig.asset
      );

    } else if(direction === 'sell') {
      ////if we want to sell we must sell not that amount which we have but that
      //// amount we will can have or amount of currency(not asset)
      // this.broker.createMarketOrder();
      if (this.exposed2 === -1) {
        log.info('NOT SELLING, already exposed');
        return this.deferredEmit('tradeAborted', {
          id,
          adviceId: advice.id,
          action: direction,
          portfolio: this.portfolio,
          balance: this.balance,
          reason: "Portfolio already in position."
        });
      }
        ////TODO close position and go short
         this.broker.closePosition(exposed2, pos_amount);

      // this.order = this.broker.createMarketOrder('sell');


      // clean up potential old stop trigger
      if(this.activeStopTrigger) {
        this.deferredEmit('triggerAborted', {
          id: this.activeStopTrigger.id,
          date: advice.date
        });

        this.activeStopTrigger.instance.cancel();

        delete this.activeStopTrigger;
      }
      //console.log('!!!!!!!!!!',  this.portfolio); ////
      //// amount = this.portfolio.asset;
      amount = this.portfolio.currency / this.price*0.95;
      log.info(
        'Trader',
        'Received advice to go short.',
        'Selling ', this.brokerConfig.asset
      );
    }
    else if (direction === 'close'){
      log.debug("CLOSES")
      log.info(
        'Trader',
        'Received advice to close position',
        'Selling ', config.trader.asset
      );
      this.manager.trade('CLOSE');
    }



  }).then(async ()=> {
    await this.sync(()=>{
      this.createOrder(direction, (this.portfolio.currency/this.price*0.95) , advice, id)
    })

  })
};


Trader.prototype.createOrder = function(side, amount, advice, id) {
  ////I dont know if short can worcking with sticky orders maybe need to creacte order in exchange/orders/
  const type = 'sticky';

  // NOTE: this is the best check we can do at this point
  // with the best price we have. The order won't be actually
  // created with this.price, but it should be close enough to
  // catch non standard errors (lot size, price filter) on
  // exchanges that have them.
  const check = this.broker.isValidOrder(amount, this.price);

  if(!check.valid) {
    log.warn('NOT creating order! Reason:', check.reason);
    return this.deferredEmit('tradeAborted', {
      id,
      adviceId: advice.id,
      action: side,
      portfolio: this.portfolio,
      balance: this.balance,
      reason: check.reason
    });
  }

  log.debug('Creating order to', side, amount, this.brokerConfig.asset);

  this.deferredEmit('tradeInitiated', {
    id,
    adviceId: advice.id,
    action: side,
    portfolio: this.portfolio,
    balance: this.balance
  });

  this.order = this.broker.createOrder(type, side, amount);

  this.order.on('fill', f => log.info('[ORDER] partial', side, 'fill, total filled:', f));
  this.order.on('statusChange', s => log.debug('[ORDER] statusChange:', s));

  this.order.on('error', e => {
    log.error('[ORDER] Gekko received error from GB:', e.message);
    log.debug(e);
    this.order = null;
    this.cancellingOrder = false;

    this.deferredEmit('tradeErrored', {
      id,
      adviceId: advice.id,
      date: moment(),
      reason: e.message
    });

  });
  this.order.on('completed', () => {
    this.order.createSummary((err, summary) => {
      if(!err && !summary) {
        err = new Error('GB returned an empty summary.')
      }

      if(err) {
        log.error('Error while creating summary:', err);
        return this.deferredEmit('tradeErrored', {
          id,
          adviceId: advice.id,
          date: moment(),
          reason: err.message
        });
      }

      log.info('[ORDER] summary:', summary);
      this.order = null;
      this.sync(() => {

        let cost;
        if(_.isNumber(summary.feePercent)) {
          cost = summary.feePercent / 100 * summary.amount * summary.price;
        }

        let effectivePrice;
        if(_.isNumber(summary.feePercent)) {
          if(side === 'buy') {
            effectivePrice = summary.price * (1 + summary.feePercent / 100);
          } else {
            effectivePrice = summary.price * (1 - summary.feePercent / 100);
          }
        } else {
          log.warn('WARNING: exchange did not provide fee information, assuming no fees..');
          effectivePrice = summary.price;
        }

        this.deferredEmit('tradeCompleted', {
          id,
          adviceId: advice.id,
          action: summary.side,
          cost,
          amount: summary.amount,
          price: summary.price,
          portfolio: this.portfolio,
          balance: this.balance,
          date: summary.date,
          feePercent: summary.feePercent,
          effectivePrice
        });

        if(
          side === 'buy' &&
          advice.trigger &&
          advice.trigger.type === 'trailingStop'
        ) {
          const trigger = advice.trigger;
          const triggerId = 'trigger-' + (++this.propogatedTriggers);

          this.deferredEmit('triggerCreated', {
            id: triggerId,
            at: advice.date,
            type: 'trailingStop',
            properties: {
              trail: trigger.trailValue,
              initialPrice: summary.price,
            }
          });

          log.info(`Creating trailingStop trigger "${triggerId}"! Properties:`);
          log.info(`\tInitial price: ${summary.price}`);
          log.info(`\tTrail of: ${trigger.trailValue}`);

          this.activeStopTrigger = {
            id: triggerId,
            adviceId: advice.id,
            instance: this.broker.createTrigger({
              type: 'trailingStop',
              onTrigger: this.onStopTrigger,
              props: {
                trail: trigger.trailValue,
                initialPrice: summary.price,
              }
            })
          }
        }
      });
    })
  });
}

Trader.prototype.onStopTrigger = function(price) {
  log.info(`TrailingStop trigger "${this.activeStopTrigger.id}" fired! Observed price was ${price}`);

  this.deferredEmit('triggerFired', {
    id: this.activeStopTrigger.id,
    date: moment()
  });

  const adviceMock = {
    recommendation: 'short',
    id: this.activeStopTrigger.adviceId
  }

  delete this.activeStopTrigger;

  this.processAdvice(adviceMock);
}

Trader.prototype.cancelOrder = function(id, advice, next) {

  if(!this.order) {
    return next();
  }

  this.cancellingOrder = true;

  this.order.removeAllListeners();
  this.order.cancel();
  this.order.once('completed', () => {
    this.order = null;
    this.cancellingOrder = false;
    this.deferredEmit('tradeCancelled', {
      id,
      adviceId: advice.id,
      date: moment()
    });
    this.sync(next);
  });
}

module.exports = Trader;
