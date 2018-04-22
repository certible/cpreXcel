/* cpreXcelGen.js - present the statistics in an Excel sheet */
/*
Copyright 2018, Certible OG

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

var fs         = require('fs'),
    xlsx       = require('xlsx.js'),
    path       = require('path');

var chapters   = require('./chapters.json');


var cov        = require('covariance');

function _sum(a) {
    var e = 0;
    for ( var i = 0; i < a.length; ++i ) {
        e += a[i];
    }
    return e;
}

function stdev(a){
    var _x = _sum(a)/a.length;

    var e = 0;
    for ( var i = 0; i < a.length; ++i ) {
        var n = a[i];
        e += Math.pow(n-_x,2);
    }
    var _s = e/a.length;

    return Math.abs(Math.sqrt(_s));
}

(function() {
	
    function idSort(a, b){
        var aa = parseInt(a.replace(/[A-Z-]+-([0-9]+).*/, "$1"));
        var bb = parseInt(b.replace(/[A-Z-]+-([0-9]+).*/, "$1"));
        return aa-bb;
    }

	function generator() {

        var m_langCandidates = undefined;
        var m_langQuestions  = undefined;

        var m_topLabel    = "top";
        var m_bottomLabel = "bottom";

        this.setLangQuestions = function(q) {
            m_langQuestions = q;
        }    

        this.setLangCandidates = function(langcand) {
            m_langCandidates = langcand; 
        }
 
        this.setTopLabel    = function(s) { m_topLabel = s; }
        this.setBottomLabel = function(s) { m_bottomLabel = s; }

        function toHex(d) {
            return  ("0"+(Number(d).toString(16))).slice(-2).toUpperCase()
        }

        var percentColors = [
            { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0 } },
            { pct: 0.5, color: { r: 0xff, g: 0xff, b: 0 } },
            { pct: 1.0, color: { r: 0x00, g: 0xff, b: 0 } } ];

        var getColorForPercentage = function(pct) {
            for (var i = 1; i < percentColors.length - 1; i++) {
                if (pct < percentColors[i].pct) {
                    break;
                }
            }
            var lower    = percentColors[i - 1];
            var upper    = percentColors[i];
            var range    = upper.pct - lower.pct;
            var rangePct = (pct - lower.pct) / range;
            var pctLower = 1 - rangePct;
            var pctUpper = rangePct;
            var color    = {
                r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
                g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
                b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
            };
            return toHex(color.r) + toHex(color.g) + toHex(color.b);
        } 

        function isInt(n){
            return typeof n == "number" && isFinite(n) && n%1===0;
        }
       
        function getDigitsFormatCode ( digits, percent ) {
            return "0" + ( digits > 0 ? "." + Array(digits+1).join("0") : "" ) + ( percent ? "%" : "" );
        }
 
        this.pushCell = function ( line, value, type, digits, fontColor, bgColor, width, colSpan, hAlign, borders ) {
            var cell = {
				hAlign: 'right',
                autoWidth: "false", 
            };

            if ( borders ) {
                cell.borders = borders;
            }

            if ( fontColor ) {
                cell.fontColor = fontColor;
            }
            if ( bgColor ) {
                cell.backgroundColor = bgColor;
            }
            
            cell.width = width ? width : 9;

            if ( colSpan ) {
                cell.colSpan = colSpan;
            }
            if ( hAlign ) {
                cell.hAlign = hAlign;
            }    

            if ( value != undefined ) {
                if ( type === "n" || type === "p" ) {
                    cell.formatCode = getDigitsFormatCode ( digits, type == "p" );
                    cell.value      = value;
                }
                else if ( type === "t" ) {
                    cell.formatCode = "[h]:mm:ss";
                    cell.value      = (value/1000)/86400; 
                }
                else if ( type === "f" ) {
                    cell.formula = value;
                    cell.value   = value;
                }
                else if ( type === "x" ) {
                    cell.formatCode = "General";
                    cell.isStringX  = true;
                    cell.value      = value;
                }
                else {
                    cell.value = String(value);
                }
            }

            line.push ( cell );
        }

        this.pushGreenRedCell = function ( line, value, type, digits, hurdle, width ) {
            var green = false;

            if ( typeof value === "string" ) {
                green = value == hurdle;
            } 
            else {
                green = value >= hurdle;
            }
            this.pushCell ( line, value, type, digits, green ? '006725' : 'ab0000', green ? 'baf4cd' : 'ffc2cd', width );
        }
        
		this.fillResult = function(worksheet,lang,candidates,Awidth) {

			var offset = 0;
			var sumResult = 0;
			var sumChapters = [];
			var alleLength = candidates.length;
            var line;

            var hurdleAvg = 0.7;

			for ( var i = 0; i < candidates.length; ++i ) {
                var cand = candidates[i];
                hurdleAvg = cand.hurdle;
				sumResult += cand.quota;
				line = [];
				
                this.pushCell ( line, String(chapters.trans.candidate[lang] + (i+1)), 0,0,0,0, Awidth, undefined, "right" );        
            
                this.pushGreenRedCell ( line, cand.quota / 100, "p", 2, cand.hurdle );

                for ( var j in cand.chapterPercentage) {
                    if ( !sumChapters[j] ) {
                        sumChapters[j] = 0;
                    }
                    var valcp = cand.chapterPercentage[j];
                    this.pushCell ( line, valcp, "p", 2 );
                    sumChapters[j] += valcp;
                }

                var cl = worksheet.length+1;
                this.pushCell ( line, " ", 0,0,0,0, Awidth );

                var qdiff = cand.origQuota - cand.quota;
                this.pushCell ( line, qdiff/100, "p", 2 );
                this.pushCell ( line, cand.origQuota/100, "p", 2 );				
                this.pushCell ( line, " ", 0,0,0,0, Awidth );
                this.pushCell ( line, String(cand.identifier), 0,0,0,0, Awidth, undefined, "right" );        

				worksheet.push(line);
			}

			line = [];

			var val = sumResult/alleLength;

            this.pushCell ( line, String(chapters.trans.average[lang]), 0,0,0,0, Awidth, undefined, "right" );        
            this.pushGreenRedCell ( line, val / 100, "p", 2, hurdleAvg );

			for ( var ii in sumChapters ) {
				val = sumChapters[ii]/alleLength;
                this.pushGreenRedCell ( line, val, "p", 2, hurdleAvg );
			}
			worksheet.push(line);
		}



        this.overviewTabular = function ( lang, exam, candidates ) {
    
			var worksheet = [];
            var line = [];

            if ( chapters[exam] == undefined ) {
                console.log("Chapters for " + exam + " undefined");
            }
			var chap = chapters[exam][lang];

            var Awidth = 15;

            this.pushCell ( line, " ", 0,0,0,0, Awidth );
            this.pushCell ( line, " ", 0,0,0,0,0, chapters[exam].columns, "left", {bottom:'000000'} );
            worksheet.push(line);       
			
            var i = 0;
			for ( ; i < chap.length; ++i ) {

                line = [];
                this.pushCell ( line, " ", 0,0,0,0, Awidth );
                
                this.pushCell ( line, String(i+1)+". "+chap[i], 0,0,0, 'f0f0f0', undefined, chapters[exam].columns, "left", {left:'000000',right:'000000'} );
                worksheet.push(line);       
			}

            
            line = [];
            this.pushCell ( line, " ", 0,0,0,0, Awidth );
		
            for ( var i = 0; i < chapters[exam].columns; ++i ) {
                this.pushCell ( line, " ", 0,0,0, 'ffffff', 0,0, "left", {top:'000000'} );
            }


            worksheet.push(line);

            line = [];
            this.pushCell ( line, " ", 0,0,0,0, Awidth );
			worksheet.push(line);

            line = [];
            this.pushCell ( line, " ", 0,0,0,0, Awidth );
            this.pushCell ( line, chapters.trans.sum[lang], 0,0,0,0,0,0, "center" );
            
            for ( var j = 0; j < chap.length; ++j ) {
                this.pushCell ( line, chapters.trans.chapter[lang] + " "  + String(j+1), 0,0,0,0,0,0, "center" );
			}
            this.pushCell ( line, " ", 0,0,0,0, Awidth );
            this.pushCell ( line, "Difference to Reported Result in XML", 0,0,0,0, Awidth );
            this.pushCell ( line, "Reported Result in XML", 0,0,0,0, Awidth );

            worksheet.push(line);

			this.fillResult(worksheet,lang,candidates,Awidth);
            return worksheet;
        }





        function pad2(n) {
            return ( n < 10 ? "0" : "" ) + n;
        }

        function pad3(n) {

            return ( n < 100 ? "0" : "" ) + pad2( n );
        }



        this.printAvg = function( label, avg, type, digits, color, width ) {
            var line = [];
            this.pushCell(line, label, 0,0,0,0, width );
            
            var statIDs = Object.keys(m_statsIDs).sort(idSort);


            for ( var i = 0; i < statIDs.length; ++i ) {
                var myColor = color ? getColorForPercentage(avg[statIDs[i]]) : undefined;
                this.pushCell(line, avg[statIDs[i]], type, digits, undefined, myColor );
            }
            return line;
        }



        this.questionResult = function ( lang, exam ) {
            
			var worksheet = [];
            
            var line      = [];
            var Awidth    = 10;
                
            var head      = ["Points avg.","Percent avg","Hundred Percent","Completion"];
            var answers   = ["A","B","C","D","E","F","G"];

            for ( var ixi = 0; ixi < 10; ++ixi ) {
                this.pushCell ( line, " ", 0,0,0,0, Awidth );
            }

            var labels = {
                "all":    "all",
                "top":    m_topLabel,
                "bottom": m_bottomLabel 
            };

            var allQuestions = m_langQuestions[exam]["all"];

            for ( let i in allQuestions ) {
                this.pushCell ( line, labels[i], 0,0,0,0,0, head.length , "center" );
            }

            for ( let i = 0; i < answers.length; ++i ) {
                this.pushCell ( line, answers[i], 0,0,0,0,0, Object.keys(allQuestions).length, "center" );
            }


            worksheet.push(line);
            line = [];        

            this.pushCell ( line, "Question ID", 0,0,0,0, Awidth );
            this.pushCell ( line, "Version", 0,0,0,0, Awidth );
            this.pushCell ( line, "Language", 0,0,0,0, Awidth );
            this.pushCell ( line, "Errors", 0,0,0,0, Awidth );
            this.pushCell ( line, "max. Points", 0,0,0,0, Awidth );
            this.pushCell ( line, "Item difficulty", 0,0,0,0, Awidth );
            this.pushCell ( line, "Item-total correlation", 0,0,0,0, Awidth );
            this.pushCell ( line, "count all", 0,0,0,0, Awidth );
            this.pushCell ( line, "count " + m_topLabel, 0,0,0,0, Awidth );
            this.pushCell ( line, "count " + m_bottomLabel, 0,0,0,0, Awidth );

            for ( let i in allQuestions ) {
                for ( var i = 0; i < head.length; ++i ) {
                    this.pushCell ( line, head[i], 0,0,0,0, Awidth );
                }
            }
            for ( let i = 0; i < answers.length; ++i ) {
                for ( var ii in allQuestions ) {
                    this.pushCell ( line, ii, 0,0,0,0, Awidth );
                }
            }
            worksheet.push(line);

            for ( var lg in m_langCandidates[exam] ) {
                if ( lg === "all" ) continue;

                var questions = m_langQuestions[exam][lg];

                
                var statIDs = Object.keys(questions.all).sort(idSort);
                for ( var si = 0; si < statIDs.length; ++si ) {
                    
                    i = statIDs[si];
                    line  = [];
                    var q = [];
                    
                    q[0] = questions.all[i];
                    q[1] = questions.top[i];
                    q[2] = questions.bottom[i];

                    
                    
                    var dl = q[0].itemDifficultyLevels;

                    var dlsum = 0;
                    var dlsumx = 0;
                    for ( var dli = 0; dli < dl.length; ++dli ) {
                        dlsum += dl[dli] || 0;
                        dlsumx += dli*(dl[dli]||0);
                    }

                    var itemDifficulty = dlsumx/(dlsum*(dl.length-1));

                    var ic = q[0].itemCorrelation;

                    var tsCov   = cov(ic.xi,ic.xt);
                    var tsDevXi = stdev(ic.xi);
                    var tsDevXt = stdev(ic.xt);
                    var ts      = tsCov / ( ( tsDevXi * tsDevXt ) || 0.00000001 );


                    this.pushCell ( line, i.split("_")[0], 0,0,0,0, Awidth );
                    this.pushCell ( line, i.split("_")[1], 0,0,0,0, Awidth );
                    this.pushCell ( line, lg, 0,0,0,0, Awidth );

                    if ( q[0].gradeDelta ) {
                        this.pushCell ( line, q[0].gradeDelta + " ERRORS", 0,0,0,0, Awidth );
                    }
                    else {
                        this.pushCell ( line, "", 0,0,0,0, Awidth );
                    }


                    this.pushCell ( line, q[0].maxPoints, 0,0,0,0, Awidth );
                    this.pushCell ( line, itemDifficulty, 0,0,0,0, Awidth );
                    this.pushCell ( line, ts, 0,0,0,0, Awidth );
                    this.pushCell ( line, q[0] != undefined ? q[0].count : 0, 0,0,0,0, Awidth );
                    this.pushCell ( line, q[1] != undefined ? q[1].count : 0, 0,0,0,0, Awidth );
                    this.pushCell ( line, q[2] != undefined ? q[2].count : 0, 0,0,0,0, Awidth );

                    for ( var ii = 0; ii < 3; ++ii ) {
                        if ( q[ii] ) {
                            this.pushCell ( line, q[ii].points/q[ii].count, "n",2,0,0, Awidth );
                            this.pushCell ( line, (q[ii].points/q[ii].count)/q[ii].maxPoints, "p",2,0,0, Awidth );
                            this.pushCell ( line, q[ii].hundred/q[ii].count, "p",2,0,0, Awidth );
                            this.pushCell ( line, (q[ii].nrOfAnswers/q[ii].count)/q[ii].nrOfCorrectAnswers, "p",2,0,0, Awidth );
                            
                        }
                        else {
                            for ( var iii = 0; iii < head.length; ++iii ) {
                                this.pushCell ( line, "--", 0,0,0,0, Awidth );
                            }
                        }
                    } 
                   
                    for ( var ii = 0; ii < q[0].correct.length; ++ii ) {
                        for ( var iii = 0; iii < 3; ++iii ) {
                            if ( q[iii] ) {
                                if ( i[0] == "K" || i[2] == "K" ) {
                                    this.pushCell ( line, q[iii].correct[ii]/q[iii].count, "p",2,0,0, Awidth );
                                }
                                else {
                                    this.pushCell ( line, q[iii].answered[ii]/q[iii].count * ( q[0].correctAnswers[ii] ? 1 : -1 ), "p",2,0,0, Awidth );
                                }
                            }
                            else {
                                this.pushCell ( line, "--", 0,0,0,0, Awidth );
                            }
                        }
                    } 

                    worksheet.push(line);
                }
            }

            return worksheet;
        }

        this.detailedResult = function ( lang, exam, candidates, questions, nulleins ) {
   

			var worksheet = [];
            var line      = [];
            var Awidth    = 24;

            var statIDs = Object.keys(questions.all).sort(idSort);

            this.pushCell ( line, "Question: ", 0,0,0,0, Awidth );
            for ( var j = 0; j < statIDs.length; ++j ) {
                this.pushCell ( line, statIDs[j] );
            }

            var head   = ["Passed","Points","Percent"];
            var widths = [8, 8, 8];

            for ( var i = 0; i < head.length; ++i ) {
                this.pushCell ( line, head[i], 0,0,0,0, widths[i] );
            }

            worksheet.push(line);

            line = [];
            this.pushCell ( line, "max. Points", 0,0,0,0, Awidth );
            for ( var j = 0; j < statIDs.length; ++j ) {
                var i = statIDs[j]; 
                var q = questions.all[i];
                this.pushCell ( line, q.maxPoints, "n", 2 );
            }

            worksheet.push(line);
            worksheet.push([{value: " " }]);

			for ( var i = 0; i < candidates.length; ++i ) {
                line = [];

                var cand = candidates[i];
                if ( cand == undefined ) break;
        
                this.pushCell ( line, "Candidate " + pad3(i+1) );

                for ( var j = 0; j < statIDs.length; ++j ) {
                    
                    var p = undefined;
                    
                    var id = statIDs[j].split("_")[0];
                    var v  = statIDs[j].split("_")[1];

                    if ( cand.versions == undefined || cand.versions[id] == v ) {
                        if ( nulleins ) {
                            p = cand.answered[id].join("");
                            if ( id[0] == "K" ) {
                                p = p.replace(/0/g,"X").replace(/1/g,"0").replace(/2/g,"1")
                            }
                        }
                        else {
                            p = cand.points[id];                
                        } 
                    }
                        
                    this.pushCell ( line, p, nulleins ? "x" : "n", nulleins ? undefined : 2 ); 
                }
            
                this.pushGreenRedCell ( line, ( cand.passed ? "PASSED" : "FAILED" ), 0,0, "PASSED", widths[0] );
                
                this.pushCell ( line, cand.fPoints, "n", 2, 0,0, widths[1] );
                targetQuota = cand.hurdle * 100; 
                var qcolor = getColorForPercentage(cand.quota < targetQuota ? 0 : cand.quota / 100);
                this.pushCell ( line, cand.quota/100, "p", 2, undefined, qcolor, widths[2] );

        
                worksheet.push(line);
            }

            return worksheet;
        }


		this.writeExcel = function(filename,lang) {
			 
            var worksheets = [];

            for ( var et in m_langCandidates ) {

                    worksheets.push (
                        {
    					    data: this.overviewTabular(lang,et,m_langCandidates[et]["all"]),
    					    name: et + ' Chapter Result'
    					}
                    );
             
                    worksheets.push (
                        {
					    data: this.questionResult(lang,et),
    					    name: et + ' Question Statistics'
    					}
                    );

                    worksheets.push (
                        {
    					    data: this.detailedResult(lang,et,m_langCandidates[et]["all"],m_langQuestions[et]["all"]),
    					    name: et + ' Detailed Result'
                        }
                    );

                    worksheets.push (
                        {
					        data: this.detailedResult(lang,et,m_langCandidates[et]["all"],m_langQuestions[et]["all"],true),
					        name: et + ' NullEins'
                        }
                    );
            }

		    var sheet = xlsx({
				creator: 'Certible cpreXcel Report Generator',
				lastModifiedBy: 'Certible cpreXcel Report Generator',
				worksheets: worksheets
				});

		    fs.writeFileSync( filename, sheet.base64, 'base64' );
		    candidates = [];
		    ids = [];
        }

        return this;
	}
    
    module.exports.generator = generator;
})();
