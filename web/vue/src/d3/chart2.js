import {Line} from 'vue-chartjs'

export default  {
    props: ["roundtrips"],
    methods:{    fmt: date => {

            // roundtrips coming out of a backtest
            // are unix timestamp, live roundtrips
            // are date strings.
            // TODO: normalize

            let mom;

            if(_.isNumber(date)) {
                mom = moment.unix(date);
            } else {
                mom = moment(date).utc();
            }

            return mom.utc().format('YYYY-MM-DD HH:mm');
        },
        round: n => (+n).toFixed(3),
    },

    extends:
        Line,

            mounted()
        {

          // console.log("win",this.roundtrips);

           const EnterRoundtrip_arr = this.roundtrips.map((round)=>{return this.fmt(round.entryAt)});
           const FirstBalance = this.roundtrips[0].entryBalance;
           const FirstPrice = this.roundtrips[0].entryPrice;
           const StrategyBalance_arr = this.roundtrips.map((round)=>{return (round.exitBalance/FirstBalance - 1)*100});
           const MarketBalance_arr = this.roundtrips.map((round)=>{return (round.exitPrice/FirstPrice - 1)*100});



           // console.log(StrategyBalance_arr);
            this.renderChart({
                labels: EnterRoundtrip_arr ,
                datasets: [
                    {
                        label: 'Strategy Profit',
                        borderColor: 'rgba(0,0,255,1)',
                        backgroundColor: 'rgba(100,0,255,0.7)',
                        data: StrategyBalance_arr
                    }, {
                        label: 'Market Profit',
                        borderColor: 'rgba(0,255,0,1)',
                        backgroundColor: 'rgba(100,255,0,0.4)',
                        data: MarketBalance_arr
                    }
                ]
            }, {responsive: true, maintainAspectRatio: false})

        }

 //   }
}