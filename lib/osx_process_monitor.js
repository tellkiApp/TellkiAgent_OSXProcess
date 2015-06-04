/**
* This script was developed by Guberni and is part of Tellki's Monitoring Solution
*
* June, 2015
* 
* Version 1.0
*
* DESCRIPTION: Monitor OSX Physical Disks
*
* SYNTAX: node osx_load_average_monitor.js <METRIC_STATE> <PROCESSES>
* 
* EXAMPLE: node osx_load_average_monitor.js "1,1,1,1,1" "ssh service;/usr/sbin/sshd#1,node service;/usr/local/bin/node#3"
*
* README:
*       <METRIC_STATE> is generated internally by Tellki and it's only used by Tellki default monitors.
*       1 - metric is on ; 0 - metric is off
*       <PROCESSES> (internal): only used by Tellki default monitors. Process name and # of instances to check.
**/

// METRICS
var metrics = [];
metrics['STATUS'] =  { retrieveMetric: 1, id: '27:Status:9' };
metrics['VM_MEM'] =  { retrieveMetric: 1, id: '94:Proc Virtual Memory:4' };
metrics['PH_MEM'] =  { retrieveMetric: 1, id: '18:Proc Physical Memory:4' };
metrics['MEM_US'] =  { retrieveMetric: 1, id: '92:% Proc Memory Utilization:6' };
metrics['CPU_US'] =  { retrieveMetric: 1, id: '53:% Proc CPU Utilization:6' };

// ############# INPUT ###################################

//START
(function() {
    try
    {
        monitorInputProcess(process.argv.slice(2));
    }
    catch(err)
    {   
        console.log(err.message);
        process.exit(1);

    }
}).call(this)

/*
* Process the passed arguments and send them to monitor execution
* Receive: arguments to be processed
*/
function monitorInputProcess(args)
{
    if (args[0] != undefined && args[1] != undefined)
    {
        //<METRIC_STATE>
        var metricState = args[0].replace(/\"/g, '');
        var tokens = metricState.split(',');

        if(tokens.length != Object.keys(metrics).length)
            throw new Error('Invalid number of metric state');

        var i = 0;
        for (var key in metrics) 
        {
            if (metrics.hasOwnProperty(key)) 
            {
                metrics[key].retrieveMetric = parseInt(tokens[i]);
                i++;
            }
        }

        monitor(parseProcesses(args[1]));
    }
}

function parseProcesses(arg)
{
    var out = [];
    var processes = arg.split(',');

    for (var key in processes)
    {
        var tokens = processes[key].split(';');
        tokens = tokens[1].split('#');

        out.push({
            path: tokens[0],
            count: parseInt(tokens[1]),
            lines: []
        })
    }

    return out;
}

//################# CPU ###########################

/*
* Retrieve metrics information
*/
function monitor(processes)
{
    var process = require('child_process');
     
    var ls = process.exec('ps auxww', function (error, stdout, stderr) {
        
        if (error)
            errorHandler(new UnableToGetMetricsError());

        parseResult(processes, stdout.trim());
    });
        
    ls.on('exit', function (code) {
        if(code != 0)
            errorHandler(new UnableToGetMetricsError());
    });
}

/*
* Parse result from process output
* Receive: string containing results
*/
function parseResult(processes, result)
{
    var filename = getFilename();
    var outputMetrics = [];
    var lines = result.split('\n');

    for (var i in lines)
    {
        //var tokens = lines[i].r.split(' ', 11);

        //console.log(tokens);

        for (var p in processes)
        {
            if (lines[i].indexOf(processes[p].path) >= 0 && lines[i].indexOf(filename) === -1)
            {
                processes[p].lines.push(lines[i]);
            }
        }
    }

    for (var p in processes)
    {
        if (processes[p].lines.length !== processes[p].count)
        {
            // Running instances are missing.

            var m = new Object();
            m.id = metrics['STATUS'].id;
            m.variableName = 'STATUS';
            m.object = processes[p].path;
            m.value = 0;
            outputMetrics.push(m);
        }
        else
        {
            // All runnning instances found.

            var cpuTotal = 0.0;
            var memTotal = 0.0;
            var vszTotal = 0.0;
            var rssTotal = 0.0;

            for (var l in processes[p].lines)
            {
                var line = processes[p].lines[l];

                 var tokens = line.replace(/\s+/g, ' ').split(' ', 10);

                 // USER              PID  %CPU %MEM      VSZ    RSS   TT  STAT STARTED      TIME COMMAND

                 cpuTotal += parseFloat(tokens[2], 10);
                 memTotal += parseFloat(tokens[3], 10);
                 vszTotal += (parseInt(tokens[4], 10) / 1024); // VSZ
                 rssTotal += (parseInt(tokens[5], 10) / 1024); // RSS
            }

            var m = new Object();
            m.id = metrics['STATUS'].id;
            m.variableName = 'STATUS';
            m.object = processes[p].path;
            m.value = 1;
            outputMetrics.push(m);

            var m = new Object();
            m.id = metrics['CPU_US'].id;
            m.variableName = 'CPU_US';
            m.object = processes[p].path;
            m.value = cpuTotal.toFixed(2);
            outputMetrics.push(m);

            var m = new Object();
            m.id = metrics['MEM_US'].id;
            m.variableName = 'MEM_US';
            m.object = processes[p].path;
            m.value = memTotal.toFixed(2);
            outputMetrics.push(m);

            var m = new Object();
            m.id = metrics['VM_MEM'].id;
            m.variableName = 'VM_MEM';
            m.object = processes[p].path;
            m.value = vszTotal.toFixed(2);
            outputMetrics.push(m);

            var m = new Object();
            m.id = metrics['PH_MEM'].id;
            m.variableName = 'PH_MEM';
            m.object = processes[p].path;
            m.value = rssTotal.toFixed(2);
            outputMetrics.push(m);
        }
    }

    output(outputMetrics);
}

function getFilename()
{
    var path = require('path');
    return __filename.slice(__filename.lastIndexOf(path.sep) + 1);
}

//################### OUTPUT METRICS ###########################

/*
* Send metrics to console
*/
function output(toOutput)
{
    for (var i in toOutput) 
    {
        var metricToOutput = toOutput[i];

        if (metrics.hasOwnProperty(metricToOutput.variableName)) 
        {
            if(metrics[metricToOutput.variableName].retrieveMetric === 1)
            {
                var output = '';
                
                output += metricToOutput.id + '|';
                output += metricToOutput.value + '|';
                output += metricToOutput.object;
                
                console.log(output);
            }
        }
    }
}

//################### ERROR HANDLER #########################
/*
* Used to handle errors of async functions
* Receive: Error/Exception
*/
function errorHandler(err)
{
    if(err instanceof UnableToGetMetricsError)
    {
        console.log(err.message);
        process.exit(err.code);
    }
    else
    {
        console.log(err.message);
        process.exit(1);
    }
}


//####################### EXCEPTIONS ################################

//All exceptions used in script

function UnableToGetMetricsError() {
    this.name = "UnableToGetMetricsError";
    this.message = ("Unable to get cpu metrics");
    this.code = 30;
}
UnableToGetMetricsError.prototype = Object.create(Error.prototype);
UnableToGetMetricsError.prototype.constructor = UnableToGetMetricsError;
