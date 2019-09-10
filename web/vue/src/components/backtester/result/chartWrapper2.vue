<template>
    <div id="chart2">
        <div class="container">
            <div class="Chart__list">
                <div class="Chart">

                    <line-example :roundtrips = "roundtrips" ></line-example>

                </div>
            </div>
        </div>
    </div>
</template>

<script>
    import LineExample from '../../../d3/chart2'
  // console.log(roundtrips);
    export default {
        props: ['roundtrips', 'height'],
        name: 'chart2',
        components: {
            LineExample
        },
        mounted(roundtrips){
           // console.log(this.roundtrips);
        },
        methods:{
            con(){
                console.log(roundtrips)
            }
        }
    }
</script>

<style>
    #app {
        font-family: 'Avenir', Helvetica, Arial, sans-serif;
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        text-align: center;
        color: #2c3e50;
        margin-top: 60px;
    }
    .container {
        max-width: 800px;
        margin:  0 auto;
    }
</style>