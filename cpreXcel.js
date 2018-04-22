/* cpreXcel.js - derive statistics from exams */
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


var fs        = require('fs'),
    glob      = require('glob'),
    xml2js    = require('xml2js'),
    gradeExam = require('./lib/gradeExam.js'),
    cpreXcel  = require('./lib/cpreXcelGen.js').generator(),
    solution  = require('./data/versionedSolution.json');


var version = "1.1.0";

var config = {
    quantil: false,
    lang: [],
    countries: [],
    top: 80,
    bottom: 60,
    output: "result.xlsx",
    input: []
};

var g_allLanguages = {};


function filterByCountry(exam){
    if ( config.countries.length > 0 && config.countries.indexOf(exam.location.country) === -1 ) {
        console.log("removing " + exam.location.country );
        exam.removeMe = true;
    }
}

function preprocessExams(e) {
	for ( var i = 0; i < e.length; ++i ) {
		var exam = e[i];
		exam.type = exam["$"].type;
		delete exam["$"];
		cleanObject(exam);
        cleanObject(exam.location);
		exam.pool = exam.pool === "true";
		exam.examinees = exam.examinees.examinee;
        filterByCountry(exam);
		preprocessExaminees(exam.examinees, exam);
	}
}

function postProcessExams ( e ) {
    for ( var i = e.length; i > 0; --i ) {
        var exam = e[i-1];

        for ( var ii = exam.examinees.length; ii > 0; --ii ) {
            var examinee = exam.examinees[ii-1];
            if ( examinee.removeMe ) {
                exam.examinees.splice(ii-1,1);
            }
        }
        if ( !exam.examinees.length || exam.removeMe ) {
            e.splice(i-1,1);
        }
    }
}

function cleanObject(e) {
	for (var key in e) {
		e[key] = ( e.hasOwnProperty(key) && e[key].length == 1 ) ? e[key][0] : e[key];
	}
}

function preprocessExaminees(e, exam) {
	for ( var j = 0; j < e.length; ++j ) {
		var examinee = e[j];
		cleanObject(examinee);

		examinee.answersComplex = examinee.answers.answer;
		examinee.nativeLang     = examinee.nativeLang === "true";
		examinee.student	    = examinee.student === "true";
		examinee.passed	    	= examinee.passed === "true";
		examinee.examRepetition = parseInt(examinee.examRepetition);
		examinee.maxPoints 		= parseInt(examinee.maxPoints);
		examinee.points 		= parseFloat(examinee.points);
		examinee.percent 		= parseFloat(examinee.percent);
		examinee.examDuration 	= parseFloat(examinee.examDuration);
        examinee.answers        = {};
        examinee.origPoints     = {};

		preprocessAnswers(examinee.answersComplex, examinee.answers, examinee.origPoints, examinee.examLang, exam);

        examinee.versions = examinee.answersComplex.versions;
		delete examinee.answersComplex;
	}
}

function preprocessAnswers(a,answers,points,lang,exam) {
    a.versions = {};
	for ( var k = 0; k < a.length; ++k ) {
		var answer = a[k];
		answer["version"] = answer["$"]["version"]; 
        answer["lang"] = lang;
		answer["id"] = answer["$"]["id"];
        
        a.versions[answer["id"]] = answer["version"];
        
        answer.origPoints     = parseFloat(answer.points[0]);
		answer.choicesComplex = answer.choices[0].choice;
		answer.choices        = preprocessChoices(answer.choicesComplex);
        answers[answer["id"]] = answer.choices;
        points[answer["id"]]  = answer.origPoints;
        delete answer["$"];
        delete answer.choicesComplex;
	}
}

function preprocessChoices(c) {
	var result=[];
	for ( var l = 0; l < c.length; ++l ) {
		result[c[l]["$"]["id"].toLowerCase().charCodeAt(0)-97] = parseInt(c[l]["_"]);
	}
	return result;
}

function getStats ( gradeSet, examType ) {
    var allQuestions = {};
    for ( var i = 0; i < gradeSet.length; ++i ) {
        var r = gradeSet[i];
        for ( var j in r.points ) { //points is ein Hash Fragen-ID -> Punkte
            var key = j + "_" + r.versions[j];
            if ( allQuestions[key] === undefined ) {

                var sol = solution[j][r.versions[j]];

                allQuestions[key] = {
                    "count":                0,
                    "points":               0,
                    "gradeDelta":           0,                
                    "maxPoints":            sol.points,
                    "correct":              new Array(r.correct[j].length+1).join('0').split('').map(parseFloat),
                    "answered":             allQuestions[key].correct.slice(0),
                    "nrOfCorrectAnswers":   sol.answers.reduce(function(pv, cv) { return pv + (cv>0?1:0); }, 0),
                    "correctAnswers":       sol.answers,
                    "nrOfAnswers":          0,
                    "hundred":              0,
                    "itemDifficultyLevels": new Array(allQuestions[key].nrOfCorrectAnswers+2).join('0').split('').map(parseFloat),
                    "itemCorrelation": {
                        "xi":    [],
                        "xt":    []
                    };
                };
            }
            var aq = allQuestions[key];
            
            aq.gradeDelta += r.pointsDiff[j] ? 1 : 0;

            aq.count++;
            aq.points += r.points[j];
            for ( var k = 0; k < aq.correct.length; ++k ) {
                aq.correct[k]  += r.correct[j][k];
                aq.answered[k] += r.answered[j][k]>0?1:0;
            }

            aq.itemCorrelation.xi.push(r.points[j]);
            aq.itemCorrelation.xt.push(r.fPoints - x);

            aq.itemDifficultyLevels[r.correctSum[j]]++;

            aq.nrOfAnswers += r.answered[j].reduce(function(pv, cv) { return pv + (cv>0?1:0); }, 0);
            
            aq.hundred += ( r.points[j] === aq.maxPoints ? 1 : 0 );
        }
    } 
    return allQuestions;
}

function filterGrades ( allGrades, attr, value ) {
    if ( allGrades.length < 2 ) return allGrades;
    return allGrades.reduce(function(pv,cv){
        if ( !(pv instanceof Array) ) { 
            pv = pv[attr] == value ? [pv] : [];
        }
        if ( cv[attr] == value ) pv.push(cv);
        return pv;
    }); 
}

function getMinMaxGrades ( allGrades, dResult, bMax ) {
    if ( allGrades.length < 2 ) return allGrades;
    return allGrades.reduce(function(pv,cv){
        if ( !(pv instanceof Array) ) { 
            pv = bMax ? 
                 ( pv.quota < dResult ? [pv] : [] ) :
                 ( pv.quota > dResult ? [pv] : [] ); 
        }
        if ( bMax ? ( cv.quota < dResult ) : ( cv.quota > dResult ) ) pv.push(cv);
        return pv;
    }); 
}


function processAllGradeResults ( allGradeResults, examType ) {
    allGradeResults.sort(function(a, b){
        return a.fPoints-b.fPoints
    })

    var l = allGradeResults.length;
 
    var aTop = undefined;
    var aBottom = undefined;
 
    if ( config.quantil ) {
        var nTopQuantil    = l*((100-config.top)/100)
        var nBottomQuantil = l*(config.bottom/100)

        aTop    = allGradeResults.slice(l-nTopQuantil,l);
        aBottom = allGradeResults.slice(0,nBottomQuantil);
    }
    else {
        aTop    = getMinMaxGrades ( allGradeResults, config.top );
        aBottom = getMinMaxGrades ( allGradeResults, config.bottom, true ); 
    }
        
    var questions = {};


    questions.all    = getStats(allGradeResults,examType);
    questions.top    = getStats(aTop,examType);
    questions.bottom = getStats(aBottom,examType);

    return questions;
}




function processXML(result) {

    var allGradeResults = {};  
     
    for ( var i = 0; i < result.exams.length; ++i ) {
        var exam = result.exams[i];


        if ( allGradeResults[exam.type] == undefined ) {
            allGradeResults[exam.type] = [];
        }

        for ( var ii = 0; ii < exam.examinees.length; ++ii ) {
            var examinee = exam.examinees[ii];
            
            g_allLanguages[examinee.examLang] = 1;

            var identifier = "ID: " + examinee.percent + "_" + examinee.points + "_" + examinee.examDuration;

            var gradeResult = gradeExam.gradeExam(exam.type, exam.date, examinee.answers, examinee.versions, identifier );
            gradeResult.examLang = examinee.examLang;

            gradeResult.identifier = identifier;
            gradeResult.origQuota = examinee.percent;
            gradeResult.origPoints = examinee.origPoints;


            gradeResult.pointsDiff = {};
            for ( var iii in gradeResult.origPoints ) {
                var diff = Math.abs(gradeResult.origPoints[iii]-gradeResult.points[iii]);
                gradeResult.pointsDiff[iii] = diff > 0.1 ? diff : 0;
                if ( diff > 0.01 ) { console.log("Examinee Nr. " + ii + " ::: Diff in " + iii + "(IST: "+gradeResult.origPoints[iii]+" /// SOLL: "+ gradeResult.points[iii]+")"); } 
            }


            allGradeResults[exam.type].push(gradeResult);
            examinee.gradeResult = gradeResult;
        }
    }

        
    var allGradeResultsLang = {};
    var allQuestionsLang = {};


    for ( var et in allGradeResults ) {

        allGradeResultsLang[et] = {};
        allQuestionsLang[et] = {};


        var processLangs = config.lang;
        if ( !processLangs.length ) { 
            processLangs = ["de","en","fr","es","pt","zh","nl"];
        }

        var allName = processLangs.length>0?"all":"";

        allGradeResultsLang[et][allName] = allGradeResults[et];
        allQuestionsLang[et][allName] = processAllGradeResults(allGradeResultsLang[et][allName], et);

        for ( var lng = 0; lng < processLangs.length; ++lng ) {
            lang = processLangs[lng];
            allGradeResultsLang[et][lang] = filterGrades(allGradeResults[et],"examLang",lang);
            allQuestionsLang[et][lang] = processAllGradeResults(allGradeResultsLang[et][lang], et);
        } 

    }

    processExamStatistics(result.exams);

    cpreXcel.setLangCandidates ( allGradeResultsLang );
    cpreXcel.setLangQuestions ( allQuestionsLang );

    cpreXcel.setTopLabel(config.quantil?config.top+"% Quantil":"> "+config.top+"%");
    cpreXcel.setBottomLabel(config.quantil?config.bottom+"% Quantil":"< "+config.bottom+"%");

    cpreXcel.writeExcel ( config.output, "de" );
}

var parser = new xml2js.Parser();

var globalResult = {};
globalResult.exams = [];

function processFiles( files ) {

    if ( files.length > 0 ) {
        var file = files.pop();
        var rawXML = fs.readFileSync(file).toString(); 
        console.log("Processing " + file + "...");
        parser.parseString(rawXML, function (err, result) {
  	        result.exams = result.exams.exam;
   	        preprocessExams(result.exams);
            postProcessExams(result.exams);

            globalResult.exams = globalResult.exams.concat(result.exams); 
            processFiles(files);     
        });
    }
    else {
        processXML(globalResult);
        
    } 
}


var countryMap = require("./countryMap.json");


function translateCountry ( tld ) {
    var ret = countryMap.tld2country[tld];
    return ret != undefined ? ret : tld;
}


function processExamStatistics ( exams ) {

    var certs = {};

    for ( var i = 0; i < exams.length; ++i ) {
        var e = exams[i];
        var et = e.type;
        if ( certs[et] == undefined ) {
            certs[et] = {};
        }
        
        var ctry = translateCountry(e.location.country);
        
        if ( certs[et][ctry] == undefined ) {
            certs[et][ctry] = {
                "passed": 0,
                "failed": 0,
                "repeated": 0,
                "student": 0
            };
        }
        var c = certs[et][ctry];
        for ( var j = 0; j < e.examinees.length; ++j ) {
            var x = e.examinees[j];
            c.passed += x.passed ? 1 : 0;
            c.failed += x.passed ? 0 : 1;
            c.repeated += x.examRepetition ? 1 : 0;
            c.student += x.student ? 1 : 0;
        } 
    } 


    console.log(JSON.stringify(certs,null,4));
}


function error(s) {
    help();
    console.error("\n:: Error :: " + s + "\n\n");
    process.exit(1);
}


function help() {
    var scriptname = process.argv[1].replace(/\/.+\//,"");
    var usage = "Certible Exam Statistics Generator (" + version + ")\n\n" 
              + "Usage: \n" 
              + "\t" + process.argv[0] + " " + scriptname + " [OPTIONS] xml-files...\n"
              + "\nOptions:\n"
              + "\t-c COUNTRY\n\t--country COUNTRY\t\t\t(TLD like at, de, fr, ..)\n\n"
              + "\t-m METHOD\n\t--topBottomMethod METHOD\tMethod for selecting the Top X% and Bottom Y%\n"
              + "\t\t\t\t\tAvailable Methods: quantil, examResult\n\n"
              + "\t-t n\n\t--topMinPercent n\t\tTop-Value for topBottomMethod\n\n"
              + "\t-b n\n\t--bottomMaxPercent n\t\tBottom-Value for topBottomMethod\n\n"
              + "\t-l LANG\n\t--language LANG\t\t\tlanguage to be processed (de, en, ...) multiple call possible\n\n"
              + "\t-o FILENAME.xlsx\n\t--output FILENAME.xlsx\t\tFilename of the target file (e.g.: Q3_report.xlsx)\n\n"
              + "Example: \n"
              + "\t" + process.argv[0] + " " + scriptname + " -t examResult -t 80 -b 60 -l de -l en -o Q3_report.xlsx Q3_certible.xml Q3_isqi.xml\n"
    console.log(usage);
}

function processArgs () {

    var args = process.argv.slice(2,process.argv.length);

    for ( var i = 0; i < args.length; ++i ) {
        switch ( args[i] ) {

            case "-m":
            case "--topBottomMethod":
                i++;
                if ( args[i] && ( args[i] == "quantil" || args[i] == "examResult" ) ) {
                    config.quantil = args[i] == "quantil";                
                }
                else {
                    error("invalid topBottomMethod: \""+args[i]+"\"");
                }
                break;

            case "-c":
            case "--country":
                i++;
                if ( args[i] && ( args[i][0] && args[i][0] != "-" && args[i].length == 2 ) ) {
                    config.countries.push ( args[i] );
                }
                else {
                    error("invalid country: \""+args[i]+"\"" );
                }
                break;


            case "-l":
            case "--language":
                i++;
                if ( args[i] && ( args[i][0] && args[i][0] != "-" && args[i].length == 2 ) ) {
                    config.lang.push ( args[i] );                
                }
                else {
                    error("invalid language: \""+args[i]+"\"" );
                }
                break;

            case "-t":
            case "--topMinPercent":
            case "-b":
            case "--bottomMaxPercent":
                var isTop = ( args[i][1] == "t" || args[i][2] == "t" );
                i++;
                if ( args[i] && !isNaN(args[i]) ) {
                    if ( isTop ) {
                        config.top = parseInt(args[i]);
                    }
                    else {
                        config.bottom = parseInt(args[i]);    
                    }        
                }
                else {
                    error("invalid " + ( isTop ? "topMinPercent" : "bottomMaxPercent" ) + " value: \""+args[i]+"\"");
                }
                break;

            case "-o":
            case "--output":
                i++;
                if ( args[i] && /\.xlsx$/i.test(args[i]) ) {
                    config.output = args[i];
                }
                else {
                    error("invalid output filename \""+args[i]+"\" - only EXCEL-files (.xlsx, .XLSX) accepted as output");
                }
                break;


            default:
                if ( /[*?]/i.test(args[i]) ) {
                    var wildcardFiles = glob.sync(args[i]);

                    for ( var ii = 0; ii < wildcardFiles.length; ++ii ) {
                        pushXMLFile ( wildcardFiles[ii] );
                    }
                }
                else {
                    pushXMLFile ( args[i] );
                }
        }
    }

    if ( !config.input.length ) {
        error("please provide some input files");
    } 
    else {
        console.log("Processing following files: \n" + JSON.stringify(config.input,null,4));
    }
}

function pushXMLFile ( xmlfile ) {
    if ( /\.xml$/i.test(xmlfile) ) {
        config.input.push ( xmlfile );
    }
    else {
        error("invalid input filename \""+xmlfile+"\" - only XML-files (.xml, .XML) accepted as input");
    }
}

processArgs();
processFiles ( config.input.slice(0) );
