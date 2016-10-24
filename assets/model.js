var s = new Random();

class Person {
    constructor(a,b) {
        this.b = s.gamma(a,b);
        this.M = 0.5;
        this.W = 0;
        this.WM = 0;
        this.WF = 0;
        this.I = 0;
        this.bednet = 0;
        this.t = 0;

    }

    
    repRate(){
      if (params.nu == 0){

        if (this.WM>0){
          return this.WF;
        } else {
          return 0.0;
        }
       
      } else {
        return params.alpha * Math.min(this.WF ,(1/params.nu) * this.WM);
      }
    }
    
    biteRate(){
        if (this.a < 108.0){ //less than 9 * 12 = 108.0
            return this.a/108.0; 
        }  else {
            return 1.0;  
        }
    }

    react(){
          var bNReduction = 1 - (1-params.sN) * this.bedNet;
          //immune state update
          
          //I +=  (param->dt) *( (double) W - param->z * I);  
          this.I = immuneRK4Step(this.W , this.I);
          //male worm update
          var births = poisson(0.5 * bNReduction * params.xi  * this.biteRate() * params.L3 * Math.exp(-1 * params.theta * this.I) * this.b *  params.dt); //exp(-1 * beta * I)
          //births = param->poisson_dist(0.5 * param->xi  * biteRate() * param->L3 * exp(-1 * param->theta * I) * b *  param->dt); //exp(-1 * beta * I)
          var deaths = poisson( params.mu *this.WM * params.dt );
          this.WM += births - deaths;

          //female worm update
          births = poisson(0.5 * bNReduction * params.xi * this.biteRate() * params.L3 * Math.exp(-1 * params.theta * this.I) * this.b  * params.dt); //* exp(-1 * beta * I)
          //births = param->poisson_dist(0.5  * param->xi  * biteRate() * param->L3 * exp(-1 * param->theta * I) * b *  param->dt); //exp(-1 * beta * I)
          deaths = poisson( params.mu * this.WF * params.dt );
          this.WF += births - deaths;

          //Mf update
          //births = poisson(param->alpha * WF * WM);
          //deaths = poisson(param->gamma * M);
          //M += births - deaths;
          this.M += params.dt * (this.repRate() - params.gamma * this.M);
          //M += param->dt * (repRate() - param->gamma * M);
          //total worm count
          this.W = this.WM+this.WF;
          //time-step
          this.t += params.dt;
          this.a += params.dt;
          //ensure all positive state variables remain positive
          if (this.W < 0){ this.W=0; }
          if (this.WM < 0){ this.WM = 0; }
          if (this.WF < 0){ this.WF = 0; }
          if (this.I < 0){ this.I = 0.0; }
          if (this.M < 0){ this.M = 0.0; }
          //simulate event where host dies and is replaced by a new host.
          if (Math.random() < (1 - Math.exp(-1 * params.tau * params.dt) ) || this.a>1200.0){ //if over age 100 
            this.initialise();
            this.a = 0; //birth event so age is 0.
            
          }
      }

    initialise(){
  
      this.W = 0;
      this.WM = 0;
      this.WF = 0;
      this.I = 0.0;
      this.M = 0.0; //0
      this.bedNet = 0;
    }

}


class Model {
    constructor(n){
           
        this.sU=0;
        this.sB=0;
        this.sN = 0;
        this.people = new Array();
        this.n = n;
        this.bedNetInt = 0;
        this.ts = [];
        this.Ms = [];
        this.Ws = [];
        this.Ls = [];
        for (var i = 0; i < n; i++) {
            this.people.push(new Person(params.a,params.b));
        }
    }

    saveOngoing(t,mp,wp,lp){
        lp = 1- Math.exp(-lp);
        this.ts.push(t);
        this.Ms.push(mp*100);
        this.Ws.push(wp*100);
        this.Ls.push(lp*100);
    }
    
    L3(){
      var mf = 0.0;
      var bTot = 0.0;
      for(var i=0; i < this.n; i++){
        //mf += param->kappas1 * pow(1 - exp(-param->r1 *( host_pop[i].mfConc() * host_pop[i].b)/param->kappas1), 2.0);  
        mf += this.people[i].b * L3Uptake(this.people[i].M);
        bTot += this.people[i].b;
      }
      mf = mf / bTot; //(double) n;
      return mf * (1 + this.bedNetInt * params.covN * (params.sN - 1)) * params.lbda * params.g /(params.sig + params.lbda * params.psi1);
      
    }
    

    prevalence(){
        var p = 0;
        for (var i = 0; i < this.n; i++) {
            p += ( s.random() < (1 - Math.exp(-this.people[i].M)) );
        }
        return p/this.n;
    }

    aPrevalence(){
        var p = 0;
        for (var i = 0; i < this.n; i++) {
            p += (this.people[i].W>0);
        }
        return p/this.n;
    }

    MDAEvent(){
        for(var i = 0; i<this.n; i++){
          if (s.random()<params.covMDA){    //param->uniform_dist()<param->covMDA
            this.people[i].M = params.mfPropMDA * this.people[i].M;
            this.people[i].WM = Math.floor(params.wPropMDA * this.people[i].WM ); 
            this.people[i].WF = Math.floor(params.wPropMDA * this.people[i].WF ); 
          }
        }
    }

    bedNetEvent(){
        params.sig = params.sig + params.lbda * params.dN * params.covN;
        for(var i = 0; i<this.n; i++){
          if (s.random()<params.covN){    //param->uniform_dist()<param->covMDA
            this.people[i].bedNet = 1; //using bed-net
          } else {
            this.people[i].bedNet = 0; //not using bed-net
          }
        }
    }
    
    evolveAndSaves(tot_t){
        var t = 0;
        var icount = 0;
        var maxMDAt = 1200.0;
        var maxoldMDAt; //used in triple drug treatment. 
        this.bedNetInt = 0;

        for(var i =0; i < this.n; i++){ //infect everyone initially.
           //this.people[i].WM = 1;
           //this.people[i].WF = 1;
           this.people[i].M = 1.0;
        }
          maxMDAt = (1200.0 + params.nMDA * params.mdaFreq);
          if(params.IDAControl==1){ //if switching to IDA after five treatment rounds.
            maxoldMDAt = (1200.0+ 5.0 * params.mdaFreq);
          } else {
            maxoldMDAt = 2*maxMDAt; //this just makes maxoldMDAt larger than total treatment time so there is never a switch.
          }

        //double currentL3 = 0.5;
        console.log("mosquito species: ",params.mosquitoSpecies,"\n");
        params.L3 = 5.0;
        console.log("0----------100\n-");
          while(t< tot_t * 12.0){ //for 100 years update annually, then update monthly when recording and intervention is occuring.
            if (t<960.0){ //1200.0
              params.dt = 12.0;
            }else{
              params.dt = 1.0;
            }
            for(var i =0; i < this.n; i++){
              this.people[i].react();
            }
            //update
            t = this.people[0].t; 
            if (t < 12.0 * 80.0){
                params.L3 = 2.0;
            } else {
                params.L3 = this.L3(); 
            } 
            if((t % 2 == 0) && (t < Math.floor(t) +params.dt)){
                  //cout << "t = " << (double) t/12.0 << "\n";
                  this.saveOngoing(t/12.0,this.prevalence(),this.aPrevalence(),params.L3);
            }  
            if ( (Math.floor(t) % Math.floor(tot_t * 12.0/10.0) == 0) && (t < Math.floor(t) + params.dt)){ //every 10% of time run.
              console.log("-");  
              $( "#test1" ).append( ' p : ' + this.prevalence() + ' t : ' + t/12.0 );  
            }
            if (t>=1200.0 && t < 1200.0 +params.dt){ //events that occur at start of treatment after 100 years.
              console.log("bednet event at ", t);
              this.bedNetEvent();
              this.bedNetInt = 1;
            }

            if ((t % params.mdaFreq == 0) && (t < Math.floor(t) + params.dt)){ //things that need to occur annually
              //if(t>maxoldMDAt){
              //  params.mfPropMDA = (1-params.IDAchi);//0.0;
              //  params.wPropMDA = (1-params.IDAtau);//0.0;
              //}
              if( (t>1200.0) && (t<= maxMDAt) ){ //if after one hundred years and less than 125 years.
                    this.MDAEvent();  

                    setBR(true); //intervention true.
                    setVH(true);
                    setMu(true);
              } else {
                    setBR(false); //intervention false.
                    setVH(false);
                    setMu(false);
              }
 
            }
            icount++;
          }
          this.Ws = this.Ws.slice(200,this.Ws.length);
          this.Ms = this.Ms.slice(200,this.Ms.length);
          this.Ls = this.Ls.slice(200,this.Ls.length);
          this.ts = math.subtract(this.ts.slice(200,this.ts.length),this.ts[200]);
          //plot(this.ts,this.Ws,this.Ms,this.Ls);
        }
        

}


immuneRK4Step = function(W,I){
  var k1 = params.dt * (W - params.z*I);
  var k2 = params.dt * (W - params.z *(I + 0.5 * k1));
  var k3 = params.dt * (W - params.z *(I + 0.5 * k2));
  var k4 = params.dt * (W - params.z *(I + k3));
  return I + 0.1666667 * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

L3Uptake = function(mf){
  if(params.mosquitoSpecies==0){
    return params.kappas1 * Math.pow(1 - Math.exp(- params.r1 *( mf )/params.kappas1), 2.0);
  }
  else
  {
    return params.kappas1 * ( 1 - Math.exp(-r1 *( mf )/params.kappas1) );
  }
}

expTrunc = function(lambda,trunc){
  return (-1/ lambda)* Math.log(1- Math.random() *(1 - Math.exp(- lambda * trunc)) );
}

poisson = function(mean){
    var L = Math.exp(-mean);
    var p = 1.0;
    var k = 0;
 
    do {
        k++;
        p *= Math.random();
    } while (p > L);
 
    return (k - 1);

}

setBR = function(intervention){
  if (intervention){
    params.lbda = params.lbdaR * params.lbda_original;
    params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2;
  } else {
    params.lbda = params.lbda_original;
    params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2;
  }
}

setVH = function(intervention){
  if (intervention){
    params.v_to_h = params.v_to_hR * params.v_to_h_original;
    params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2;
  } else {
    params.v_to_h = params.v_to_h_original;
    params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2;
  }
}

setMu = function(intervention){
  if (intervention){
    params.sig = params.sigR; //increase mortality due to bed nets. dN = 0.41 death rate 
  } else {
    params.sig = params.sig_original;
  }  
}


//var params = [];
var params = {
    riskMu1 : 1.0, 
    riskMu2 : 1.0 ,
    riskMu3 : 1.0 , 
    shapeRisk : 0.065, //shape parameter for bite-risk distribution (0.1/0.065)
    mu : 0.0104, //death rate of worms
    theta : 0.0 , //0.001 //immune system response parameter. 0.112
    gamma : 0.1   , //mf death rate
    alpha : 0.58  , //mf birth rate per fertile worm per 20 uL of blood.
    lbda : 10  , //number of bites per mosquito per month.
    v_to_h : 9.0  ,  //vector to host ratio (39.,60.,120.) 
    kappas1 : 4.395  , //vector uptake and development anophelene
    r1 : 0.055  , //vector uptake and development anophelene
    tau : 0.00167 ,  //death rate of population
    z : 0.0  ,  //waning immunity
    nu : 0.0  ,  //poly-monogamy parameter       
    L3 : 0.0  ,  //larvae density.
    g : 0.37  , //Proportion of mosquitoes which pick up infection when biting an infected host
    sig : 5.0  , //death rate of mosquitos
    psi1 : 0.414  , //Proportion of L3 leaving mosquito per bite
    psi2 : 0.32  , //Proportion of L3 leaving mosquito that enter host
    dt : 1.0  , //time spacing (months) 
    lbdaR : 1.0  , //use of bed-net leading to reduction in bite rate
    v_to_hR : 1.0 , //use of residual-spraying leading to reduction in v_to_h 
    nMDA : 5  , //number of rounds of MDA
    mdaFreq : 12  , //frequency of MDA (months)
    covMDA : 0.65  , //coverage of MDA
    s2 : 0.00275  , //probability of L3 developing into adult worm.
    mfPropMDA : 0.05  , //proportion of mf removed for a single MDA round.
    wPropMDA : 0.45  , //proportion of worms permanently sterilised for a single MDA round. (0.55)
    rho : 0.999  , //proportion of systematic non-compliance 0- none 1- all.
    mosquitoSpecies : 0  , // 0 - Anopheles facilitation squared, 1 - Culex limitation linear.
    rhoBU : 0.0  , //correlation between bite risk and systematic non-compliance.
    aWol : 0  , //using doxycycline in intervention 0- not used, 1- is used.
    sigR : 5.0  , //new mortality rate of mosquitoes during vector intervention.
    covN : 0.0  , //coverage of bed nets.
    sysCompN : 0.99  , //systematic non-compliance of bed nets. set to near one.
    rhoCN : 0.0  , //correlation between receiving chemotherapy and use of bed nets. 
    IDAControl : 0   //if 1 then programme switches to IDA after five rounds of standard MDA defined with chi and tau.
};

//calculate other parameters for params
params.lbda_original = params.lbda;
params.v_to_h_original = params.v_to_h;
params.sig_original = params.sig;
params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2; //constant bite rate (5760.0 / 30.0)
params.a = params.shapeRisk; //shape parameter (can vary)
params.b = 1/params.a; //scale parameter determined so mean is 1.
//bed net parameters
params.sN = 0.03;
params.dN=0.41;

setPropMDA = function(regimen){
    chis = [0.99,0.95,0.99,1.0,1.0]
    taus = [0.35,0.55,0.1,1.0,0.35]
    params.mfPropMDA = 1 - chis[Number(regimen)-1]
    params.wPropMDA = 1 - taus[Number(regimen)-1]
}

closest =  function(num, arr) {
    var mid;
    var lo = 0;
    var hi = arr.length - 1;
    while (hi - lo > 1) {
        mid = Math.floor ((lo + hi) / 2);
        if (arr[mid] < num) {
            lo = mid;
        } else {
            hi = mid;
        }
    }
    if (num - arr[lo] <= arr[hi] - num) {
        return lo;
    }
    return hi;
}

setVHFromPrev = function(p,species){
  var anVH = [5., 5.55555556, 6.11111111, 6.66666667, 7.22222222, 7.77777778, 8.33333333, 8.88888889, 9.44444444,  10. ],
      cVH = [ 4.,  4.55555556,  5.11111111,  5.66666667,  6.22222222, 6.77777778,  7.33333333,  7.88888889,  8.44444444,  9.],
      anP = [ 0.09405936,  0.09882859,  0.11038997,  0.11982386,  0.12751358, 0.13604286,  0.14459468,  0.15150072,  0.15736517,  0.16302997],
      cP = [ 0.09306863,  0.11225442,  0.1267763 ,  0.13999753,  0.15040748, 0.16114762,  0.16863057,  0.17532108,  0.1827041 ,  0.18676246];
  if(species === 0){
    vhs = anVH;
    ps = anP;
  }else{
    vhs = cVH;
    ps = cP;
  }

  i = closest(p,ps);
  return vhs[i];
}

setInputParams = function(){
    ps = modelParams();
    params.nMDA = Number(ps.mda);
    params.mdaFreq = (ps.mdaSixMonths==="True")? 6.0:12.0;
    params.v_to_h = 5;//setVHFromPrev(ps.endemicity,Number(ps.species)); //5;// Number(ps.endemicity);//
    params.covMDA = Number(ps.coverage/100.0);
    params.covN = Number(ps.covN/100.0);
    params.v_to_hR = 1-Number(ps.v_to_hR/100.0);
    params.vecCap = Number(ps.vecCap);
    params.vecComp = Number(ps.vecComp);
    params.vecD = Number(ps.vecD);
    setPropMDA(Number(ps.mdaRegimen));
    params.sysComp = Number(ps.sysComp);
    params.rhoBComp = Number(ps.rhoBComp);
    params.rhoCN = Number(ps.rhoCN);
    params.species = Number(ps.species);

    //calculate other parameters for params
    params.lbda_original = params.lbda;
    params.v_to_h_original = params.v_to_h;
    params.sig_original = params.sig;
    params.xi = params.lbda * params.v_to_h * params.psi1 * params.psi2 * params.s2; //constant bite rate (5760.0 / 30.0)
    params.a = params.shapeRisk; //shape parameter (can vary)
    params.b = 1/params.a; //scale parameter determined so mean is 1.
}
plot = function(tx,wM,mfM,lM){
                  wM.unshift('worm_burden');
                  mfM.unshift('mf_burden');
                  lM.unshift('L3');
                  tx.unshift('tx');
                  c3.generate({
                      bindto: '#chart',
                      data: {
                        xs: {
                          worm_burden: 'tx',
                          mf_burden: 'tx',
                          L3: 'tx'
                          
                        },
                        columns: [
                          tx,
                          wM,
                          mfM,
                          lM
                        ],
                        names: {
                          worm_burden: 'Worm burden',
                          mf_burden: 'mf burden',
                          L3: 'L3 density'
                        }
                      },
                       axis: {
                        x: {
                          label: 'time (years)',
                          tick: {
                            fit: false
                          }
                        },
                        y: {
                          label: 'Prevalence',
                          min: 0
                        }
                      },
                      legend: {
                        position: 'right'
                      },
                      zoom: {
                        enabled: true
                      },
                      type: 'spline'
                  });
}

$(document).ready(function() {

    //var m = new Model(800);
    //m.evolveAndSaves(120.0);

});