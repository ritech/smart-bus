var word = {
  parse: function(buffer, offset) {
    return buffer.readUInt8(offset) * 256 + buffer.readUInt8(offset + 1);
  },

  encode: function(buffer, value, offset) {
    buffer.writeUInt8(Math.floor(value / 256), offset);
    buffer.writeUInt8(value % 256, offset + 1);
  }
};

var status = {
  parse: function(buffer, offset) {
    switch (buffer.readUInt8(offset)) {
      case 0xF8: return true;
      case 0xF5: return false;
    }
  },

  encode: function(buffer, value, offset) {
    buffer.writeUInt8(value ? 0xF8 : 0xF5, offset);
  }
};

var date = {
  parse: function(buffer, offset) {
    var year = buffer.readUInt8(offset++);
    var month = buffer.readUInt8(offset++);

    return new Date(2000 + year, month - 1,
      buffer.readUInt8(offset++),
      buffer.readUInt8(offset++),
      buffer.readUInt8(offset++),
      buffer.readUInt8(offset++));
  },

  encode: function(buffer, date, offset) {
    buffer.writeUInt8(date.getFullYear() - 2000, offset++);
    buffer.writeUInt8(date.getMonth() + 1, offset++);
    buffer.writeUInt8(date.getDate(), offset++);
    buffer.writeUInt8(date.getHours(), offset++);
    buffer.writeUInt8(date.getMinutes(), offset++);
    buffer.writeUInt8(date.getSeconds(), offset++);
  }
};

/*
  Commands as decribed in "Operation Code of HDL Buspro v1.111.pdf"
  from http://hdlautomation.com

  All of these commands was tested on the real hdl installation
 */
module.exports = {
  /* 4.1 Scene */

  // 4.1.1 Scene Control
  // FIXME: copy-paste from 0x0000
  0x0002: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        scene: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.scene]);
    },

    response: 0x0003
  },

  // 4.1.2 Scene Control Response
  0x0003: {
    parse: function(buffer) {
      var data = {
        area: buffer.readUInt8(0),
        scene: buffer.readUInt8(1),

        channels: new Array(buffer.readUInt8(2))
      };

      var channels = data.channels;

      for (var i = 3, length = buffer.length; i < length; i++) {
        var byte = buffer.readUInt8(i);
        var offset = (i - 3) * 8;

        for (var n = 0; n < 8 && offset + n < channels.length; n++)
          channels[offset + n] = {
            number: offset + n + 1,
            status: !!(byte & (1 << n))
          };
      }

      return data;
    },

    encode: function(data) {
      var channels = data.channels || [];
      var length = channels.length;
      var bytes = Math.ceil(length / 8);
      var buffer = new Buffer(3 + bytes);

      buffer.writeUInt8(data.area, 0);
      buffer.writeUInt8(data.scene, 1);
      buffer.writeUInt8(length, 2);

      for (var i = 0; i < bytes; i++) {
        var byte = 0;

        for (var n = 0; n < 8 && i + n < length; n++)
          if (channels[i + n].status) byte |= 1 << n;

        buffer.writeUInt8(byte, i + 3);
      }

      return buffer;
    }
  },

  // 4.1.3 Read Status of Scene
  0x000C: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0)
      };
    },

    encode: function(data) {
      return new Buffer([data.area]);
    },

    response: 0x000D
  },

  // 4.1.4 Response Read Status of Scene
  0x000D: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        scene: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.scene]);
    }
  },

  // 4.1.5 Broadcast Status of Scene
  // Documentation is wrong
  0xEFFF: {
    parse: function(buffer) {
      var data = { areas: [], channels: [] };

      var areas = data.areas;
      var channels = data.channels;

      var i;
      var length = buffer.readUInt8(0);

      for (i = 0; i < length; i++) areas.push({
        number: areas.length + 1,
        scene: buffer.readUInt8(i + 1)
      });

      length = buffer.readUInt8(i++);

      for (i = i + 1, length = buffer.length; i < length; i++) {
        var byte = buffer.readUInt8(i);

        for (var n = 0; n < 8 && channels.length + 1 < length; n++)
          channels.push({
            number: channels.length + 1,
            status: !!(byte & (1 << n))
          });
      }

      return data;
    },

    encode: function(data) {
      var areas = data.areas || [];
      var channels = data.channels || [];
      var length = channels.length;
      var bytes = Math.ceil(length / 8);
      var buffer = new Buffer(2 + areas.length + bytes);

      buffer.writeUInt8(areas.length, 0);

      var i;

      for (i = 0; i < areas.length; i++)
        buffer.writeUInt8(areas[i].scene, i + 1);

      buffer.writeUInt8(length, ++i);

      for (var j = 0; j < bytes; j++) {
        var byte = 0;

        for (var n = 0; n < 8 && j + n < length; n++)
          if (channels[j + n].status) byte |= 1 << n;

        buffer.writeUInt8(byte, i + 1 + j);
      }

      return buffer;
    }
  },

  // 4.1.6 Read Area Information
  0x0004: {
    response: 0x0005
  },

  // 4.1.7 Response Read Area Information
  0x0005: {
    parse: function(buffer) {
      var data = {
        device: {
          type: word.parse(buffer, 0),
          subnet: buffer.readUInt8(2),
          id: buffer.readUInt8(3)
        },

        // Total areas count
        // FIXME: undocumented
        areas: buffer.readUInt8(4),

        channels: []
      };

      var channels = data.channels;

      for (var i = 5, length = buffer.length; i < length; i++)
        channels.push({
          number: channels.length + 1,
          area: buffer.readUInt8(i)
        });

      return data;
    },

    encode: function(data) {
      var device = data.device;
      var channels = data.channels;
      var length = channels.length;
      var buffer = new Buffer(5 + length);

      word.encode(buffer, device.type, 0);
      buffer.writeUInt8(device.subnet, 2);
      buffer.writeUInt8(device.id, 3);

      var areas = Math.max.apply(Math, channels.map(function(channel) {
        return channel.area;
      }));

      // Total areas count
      // FIXME: undocumented
      buffer.writeUInt8(areas, 4);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(channels[i].area, i + 5);

      return buffer;
    }
  },

  // 4.1.8 Read Scene Information
  0x0000: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        scene: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.scene]);
    },

    response: 0x0001
  },

  // 4.1.9 Read Scene Information Response
  0x0001: {
    parse: function(buffer) {
      var data = {
        area: buffer.readUInt8(0),
        scene: buffer.readUInt8(1),
        time: word.parse(buffer, 2),

        channels: []
      };

      var channels = data.channels;

      for (var i = 4, length = buffer.length; i < length; i++)
        channels.push({
          number: i - 3,
          level: buffer.readUInt8(i)
        });

      return data;
    },

    encode: function(data) {
      var channels = data.channels || [];
      var length = channels.length;
      var buffer = new Buffer(4 + length);

      buffer.writeUInt8(data.area, 0);
      buffer.writeUInt8(data.scene, 1);

      word.encode(buffer, data.time, 2);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(channels[i].level, i + 4);

      return buffer;
    }
  },

  // 4.1.10 Modify Scene Information
  // Documentation is wrong
  0x0008: {
    response: 0x0009
  },

  // 4.1.11 Response Modify Scene Information
  0x0009: {
    parse: function(buffer) {
      return {
        success: status.parse(buffer, 0)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },

  /* 4.2 Sequence */

  // 4.2.1 Sequence Control
  0x001A: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        sequence: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.sequence]);
    },

    response: 0x001B
  },

  // 4.2.2 Response Sequence Control
  0x001B: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        sequence: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.sequence]);
    }
  },

  // 4.2.3 Read Status of Sequence
  0xE014: {
    parse: function(buffer) {
      return { area: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.area]);
    },

    response: 0xE015
  },

  // 4.2.4 Response Read Status of Sequence
  0xE015: {
    parse: function(buffer) {
      return {
        area: buffer.readUInt8(0),
        sequence: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.area, data.sequence]);
    }
  },

  // 4.2.5 Broadcast Status of Sequence
  0xF036: {
    parse: function(buffer) {
      var length = buffer.length;
      var data = { areas: new Array(length) };

      for (var i = 0; i < length; i++)
        data.areas[i] = { number: i + 1, sequence: buffer.readUInt8(i) };

      return data;
    },

    encode: function(data) {
      var areas = data.areas || [];
      var length = areas.length;
      var buffer = new Buffer(length);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(areas[i].sequence, i);

      return buffer;
    }
  },

  /* 4.3 Channels */

  // 4.3.1 Single Channel Control
  0x0031: {
    parse: function(buffer) {
      return {
        channel: buffer.readUInt8(0),
        level: buffer.readUInt8(1),
        time: word.parse(buffer, 2),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(4);

      buffer.writeUInt8(data.channel, 0);
      buffer.writeUInt8(data.level, 1);

      word.encode(buffer, data.time, 2);

      return buffer;
    }
  },

  // 4.3.2 Response Single Channel Control
  0x0032: {
    parse: function(buffer) {
      return {
        channel: buffer.readUInt8(0),
        success: status.parse(buffer, 1),
        level: buffer.readUInt8(2)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(3);

      buffer.writeUInt8(data.channel, 0);
      status.encode(buffer, data.success, 1);
      buffer.writeUInt8(data.level, 2);

      return buffer;
    }
  },

  // 4.3.3 Read Status of Channels
  0x0033: {
    parse: function(buffer) {
      return { channel: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.channel]);
    },

    respose: 0x0034
  },

  // 4.3.4 Response Read Status of Channels
  0x0034: {
    parse: function(buffer) {
      var length = buffer.readUInt8(0);
      var data = { channels: new Array(length) };

      for (var i = 0; i < length; i++)
        data.channels[i] = { number: i + 1, level: buffer.readUInt8(i + 1) };

      return data;
    },

    encode: function(data) {
      var channels = data.channels || [];
      var length = channels.length;
      var buffer = new Buffer(length + 1);

      buffer.writeUInt8(length, 0);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(channels[i].level, i + 1);

      return buffer;
    }
  },

  // 4.3.5 Read Current Level of Channels
  0x0038: {
    response: 0x0039
  },

  // 4.3.6 Response Read Current Level of Channels
  // FIXME: same as 0x0034
  0x0039: {
    parse: function(buffer) {
      var length = buffer.readUInt8(0);
      var data = { channels: new Array(length) };

      for (var i = 0; i < length; i++)
        data.channels[i] = { number: i + 1, level: buffer.readUInt8(i + 1) };

      return data;
    },

    encode: function(data) {
      var channels = data.channels || [];
      var length = channels.length;
      var buffer = new Buffer(length + 1);

      buffer.writeUInt8(length, 0);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(channels[i].level, i + 1);

      return buffer;
    }
  },

  /* 5. Logic */

  // 5.1.1 Logic Control
  0xF116: {
    parse: function(buffer) {
      return {
        block: buffer.readUInt8(0),
        status: Boolean(buffer.readUInt8(1))
      };
    },

    encode: function(data) {
      return new Buffer([data.block, data.status ? 1 : 0]);
    }
  },

  // 5.1.2 Response Logic Control
  // FIXME: same as 0xF116
  0xF117: {
    parse: function(buffer) {
      return {
        block: buffer.readUInt8(0),
        status: Boolean(buffer.readUInt8(1))
      };
    },

    encode: function(data) {
      return new Buffer([data.block, data.status ? 1 : 0]);
    }
  },

  // 5.1.3 Read Status of Logic Control
  0xF112: {
    parse: function(buffer) {
      return { block: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.block]);
    }
  },

  // 5.1.4 Response Read Status of Logic Control
  // FIXME: same as 0xF116
  // FIXME: documentation is wrong
  0xF113: {
    parse: function(buffer) {
      return {
        block: buffer.readUInt8(0),
        status: Boolean(buffer.readUInt8(1))
      };
    },

    encode: function(data) {
      return new Buffer([data.block, data.status ? 1 : 0]);
    }
  },

  // 5.1.5 Broadcast Status of Status of Logic Control
  // FIXME: same as 0xF116
  0xF12F: {
    parse: function(buffer) {
      return {
        block: buffer.readUInt8(0),
        status: Boolean(buffer.readUInt8(1))
      };
    },

    encode: function(data) {
      return new Buffer([data.block, data.status ? 1 : 0]);
    }
  },

  // 5.1.6 Read System Date and Time
  0xDA00: {
    response: 0xDA01
  },

  // 5.1.7 Response Read System Date and Time
  0xDA01: {
    parse: function(buffer) {
      return {
        success: status.parse(buffer, 0),
        date: date.parse(buffer, 1)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(8);

      status.encode(buffer, data.success, 0);
      date.encode(buffer, data.date, 1);

      buffer.writeUInt8(data.date.getDay(), 7);

      return buffer;
    }
  },

  // 5.1.8 Modify Read System Date and Time
  0xDA02: {
    parse: function(buffer) {
      return {
        date: date.parse(buffer, 0)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);

      date.encode(buffer, data.date, 0);

      buffer.writeUInt8(data.date.getDay(), 6);

      return buffer;
    }
  },

  // 5.1.9 Response Modify Read System Date and Time
  0xDA03: {
    parse: function(buffer) {
      return { success: status.parse(buffer, 0) };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },

  // 5.1.10 Broadcast System Date and Time (Every Minute)
  0xDA44: {
    parse: function(buffer) {
      return { date: date.parse(buffer, 0) };
    },

    encode: function(data) {
      var buffer = new Buffer(6);

      date.encode(buffer, data.date, 0);

      return buffer;
    }
  },

  /* 6. Universal Switch */

  // 6.1.1 UV Switch Control
  0xE01C: {
    parse: function(data) {
      return {
        switch: data.readUInt8(0),
        status: Boolean(data.readUInt8(1))
      };
    },

    encode: function(data) {
      var buffer = new Buffer(2);

      buffer.writeUInt8(data.switch, 0);
      buffer.writeUInt8(data.status ? 255 : 0, 1);

      return buffer;
    },

    response: 0xE01D
  },

  // 6.1.2 Response UV Switch Control
  0xE01D: {
    parse: function(data) {
      return {
        switch: data.readUInt8(0),
        status: Boolean(data.readUInt8(1))
      };
    },

    encode: function(data) {
      var buffer = new Buffer(2);

      buffer.writeUInt8(data.switch, 0);
      buffer.writeUInt8(data.status ? 1 : 0, 1);

      return buffer;
    }
  },

  // 6.1.3 Read Status of UV Switch
  0xE018: {
    parse: function(buffer) {
      return { switch: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.switch]);
    },

    response: 0xE019
  },

  // 6.1.4 Response Read Status of UV Switch
  // FIXME: same as 0xE01D
  0xE019: {
    parse: function(buffer) {
      return {
        switch: buffer.readUInt8(0),
        status: Boolean(buffer.readUInt8(1))
      };
    },

    encode: function(data) {
      var buffer = new Buffer(2);

      buffer.writeUInt8(data.switch, 0);
      buffer.writeUInt8(data.status ? 1 : 0, 1);

      return buffer;
    }
  },

  // 6.1.5 Broadcast Status of Status of UV Switches
  0xE017: {
    parse: function(buffer) {
      var length = buffer.readUInt8(0);
      var data = { switches: new Array(length) };

      for (var i = 0; i < length; i++)
        data.switches[i] = {
          number: i + 1,
          status: Boolean(buffer.readUInt8(i + 1))
        };

      return data;
    },

    encode: function(data) {
      var switches = data.switches || [];
      var length = switches.length;
      var buffer = new Buffer(length + 1);

      buffer.writeUInt8(length, 0);

      for (var i = 0; i < length; i++)
        buffer.writeUInt8(switches[i].status ? 1 : 0, i + 1);

      return buffer;
    }
  },

  /* 7. Curtain Switch */

  // 7.1.1 Curtain Switch Control
  0xE3E0: {
    parse: function(buffer) {
      return {
        curtain: buffer.readUInt8(0),
        status: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.curtain, data.status]);
    },

    response: 0xE3E1
  },

  // 7.1.2 Response Curtain Switch Control
  // FIXME: same as 0xE3E0
  0xE3E1: {
    parse: function(buffer) {
      return {
        curtain: buffer.readUInt8(0),
        status: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.curtain, data.status]);
    }
  },

  // 7.1.3 Read Status of Curtain Switch
  0xE3E2: {
    parse: function(buffer) {
      return { curtain: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.curtain]);
    },

    response: 0xE3E3
  },

  // 7.1.4 Response Read Status of Curtain Switch
  // FIXME: same as 0xE3E1
  0xE3E3: {
    parse: function(buffer) {
      return {
        curtain: buffer.readUInt8(0),
        status: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.curtain, data.status]);
    }
  },

  // 7.1.5 Broadcast Status of Status of Curtain Switches
  0xE3E4: {
    parse: function(buffer) {
      var length = buffer.length;
      var size = ~~(length / 2);
      var data = { curtains: new Array(size) };

      for (var i = 0; i < size; i++)
        data.curtains[i] = {
          number: i + 1,

          level: buffer.readUInt8(i),
          status: buffer.readUInt8(size + i)
        };

      return data;
    },

    encode: function(data) {
      var curtains = data.curtains || [];
      var length = curtains.length;
      var buffer = new Buffer(length * 2);

      for (var i = 0; i < length; i++) {
        var curtain = curtains[i];

        buffer.writeUInt8(curtain.level, i);
        buffer.writeUInt8(curtain.status, length + i);
      }

      return buffer;
    }
  },

  /* 8. GPRS Control */

  // 8.1.1 GPRS Control
  // 0xE3D4

  // 8.1.2 Response GPRS Control
  // 0xE3D5

  /* 9. Panel Control */

  // 9.1.1 Panel Control
  0xE3D8: {
    parse: function(buffer) {
      return {
        key: buffer.readUInt8(0),
        value: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.key, data.value]);
    },

    response: 0xE3D9
  },

  // 9.1.2 Response Panel Control
  // FIXME: same as 0xE3D8
  0xE3D9: {
    parse: function(buffer) {
      return {
        key: buffer.readUInt8(0),
        value: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.key, data.value]);
    }
  },

  // 9.1.3 Read Status of Panel Control
  0xE3DA: {
    parse: function(buffer) {
      return { key: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.key]);
    },

    response: 0xE3DB
  },

  // 9.1.4 Response Read Status of Panel Control
  // FIXME: same as 0xE3D8
  0xE3DB: {
    parse: function(buffer) {
      return {
        key: buffer.readUInt8(0),
        value: buffer.readUInt8(1)
      };
    },

    encode: function(data) {
      return new Buffer([data.key, data.value]);
    }
  },

   /* 10. AC & AF Control */
  // 10.0.1 Read AF Status

  

   0x144C: {

	parse: function(buffer) {

      return { afno: buffer.readUInt8(0) };
    },


    encode: function(data) {
      return new Buffer([data.afno]);
    },

    response: 0x144D

  },
	
	
	
  // 10.0.2 Response Read AF Status


  
0x144D: {  
    parse: function(buffer) {


function decodetemp(encodetemp){
var temp1, temp2, temp3; 
temp1 = (parseInt (encodetemp.slice(1,2),16));
temp2 = (parseInt (encodetemp.slice(2,4),16));
temp3 = (parseInt (encodetemp.slice(4,6),16));





if ((temp1 == 0) && (temp2 < 129))
{
airtemp =  (2 + (temp2*0.015625)+(temp3*1/16384));
}
else if ((temp1 == 0) && (temp2 > 128))
{
airtemp = ((temp2*0.03125)+(temp3*1/8192));
}

else if ((temp1 == 1) && (temp2 < 129))
{
airtemp =  (8 + (temp2*0.0625)+(temp3*1/4096));
}
else if ((temp1 == 1) && (temp2 > 128))
{
airtemp = ((temp2*0.125)+(temp3*1/2048));
}



else if ((temp1 == 2) && (temp2 < 129))
{
airtemp =  (32 + (temp2*0.25)+(temp3*1/512));
}
else if ((temp1 == 2) && (temp2 > 128))
{
airtemp = ((temp2*0.5)+(temp3*1/512));
}


else if ((temp1 == 3) && (temp2 < 129))
{
airtemp =  (128 + (temp2*1)+(temp3*1/128));
}
else if ((temp1 == 3) && (temp2 > 128))
{
airtemp =  ((temp2*2)+(temp3*1/128));
}


else if ((temp1 == 4) && (temp2 < 129))
{
airtemp =  (512 + (temp2*4)+(temp3*1/32));
}
else if ((temp1 == 4) && (temp2 > 128))
{
airtemp =  ((temp2*8)+(temp3*1/32));
}



else if ((temp1 == 5) && (temp2 < 129))
{
airtemp =  (2048 + (temp2*16)+(temp3*1/8));
}
else if ((temp1 == 5) && (temp2 > 128))
{
airtemp =  ((temp2*32)+(temp3*1/8));
}



else if ((temp1 == 6) && (temp2 < 129))
{
airtemp =  (8192 + (temp2*64)+(temp3*1/2));
}
else if ((temp1 == 6) && (temp2 > 128))
{
airtemp =  ((temp2*128)+(temp3*1/2));
}

else
{
  airtemp = 0;
 // console.log ("wrong");   
}
return (airtemp);
}


      return {
        afstatus: Boolean(buffer.readUInt8(1)), //Status. 1 on. 0 off.
        afno: buffer.readUInt8(0), //AF No.
        setupmode: buffer.readUInt8(3),//0 智能 1 手动 2 内循环 3 恒温 
        setupspeed: buffer.readUInt8(2),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
       
        temperature: {
          insidetemp: (decodetemp(buffer.readUInt32BE(6).toString(16))),//室内温度
         pm25: (decodetemp(buffer.readUInt32BE(18).toString(16))),//pm25
          tvoc: (decodetemp(buffer.readUInt32BE(22).toString(16))),//tvoc
          co2: (decodetemp(buffer.readUInt32BE(26).toString(16))),//co2
          humidity: (decodetemp(buffer.readUInt32BE(14).toString(16)))//湿度
        },





      };
    },

    encode: function(data) {
      var buffer = new Buffer(4);
      var temperature = data.temperature;

      buffer.writeUInt8(data.afstatus, 1);
      buffer.writeUInt8(data.afno, 0);
      buffer.writeUInt8(data.setupmode, 3);
      buffer.writeUInt8(data.setupspeed, 2);

      return buffer;
    }
  },
	




  // 10.0.3 Control AF Status. Type New.

0x144A: {  
    parse: function(buffer) {


      return {
        afstatus: Boolean(buffer.readUInt8(1)), //Status. 1 on. 0 off.
        afno: buffer.readUInt8(0), //AF No.
        setupmode: buffer.readUInt8(3),//0 智能 1 手动 2 内循环 3 恒温 
        setupspeed: buffer.readUInt8(2),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
       

     





 };
    },

    encode: function(data) {
      var buffer = new Buffer(4);
      var temperature = data.temperature;

      buffer.writeUInt8(data.afstatus, 1);
      buffer.writeUInt8(data.afno, 0);
      buffer.writeUInt8(data.setupmode, 3);
      buffer.writeUInt8(data.setupspeed, 2);

      return buffer;
    }
  },

  // 10.0.4 Response Control AF Status

0x144B: {  
    parse: function(buffer) {


function decodetemp(encodetemp){
var temp1, temp2, temp3; 
temp1 = (parseInt (encodetemp.slice(1,2),16));
temp2 = (parseInt (encodetemp.slice(2,4),16));
temp3 = (parseInt (encodetemp.slice(4,6),16));





if ((temp1 == 0) && (temp2 < 129))
{
airtemp =  (2 + (temp2*0.015625)+(temp3*1/16384));
}
else if ((temp1 == 0) && (temp2 > 128))
{
airtemp = ((temp2*0.03125)+(temp3*1/8192));
}

else if ((temp1 == 1) && (temp2 < 129))
{
airtemp =  (8 + (temp2*0.0625)+(temp3*1/4096));
}
else if ((temp1 == 1) && (temp2 > 128))
{
airtemp = ((temp2*0.125)+(temp3*1/2048));
}



else if ((temp1 == 2) && (temp2 < 129))
{
airtemp =  (32 + (temp2*0.25)+(temp3*1/512));
}
else if ((temp1 == 2) && (temp2 > 128))
{
airtemp = ((temp2*0.5)+(temp3*1/512));
}


else if ((temp1 == 3) && (temp2 < 129))
{
airtemp =  (128 + (temp2*1)+(temp3*1/128));
}
else if ((temp1 == 3) && (temp2 > 128))
{
airtemp =  ((temp2*2)+(temp3*1/128));
}


else if ((temp1 == 4) && (temp2 < 129))
{
airtemp =  (512 + (temp2*4)+(temp3*1/32));
}
else if ((temp1 == 4) && (temp2 > 128))
{
airtemp =  ((temp2*8)+(temp3*1/32));
}



else if ((temp1 == 5) && (temp2 < 129))
{
airtemp =  (2048 + (temp2*16)+(temp3*1/8));
}
else if ((temp1 == 5) && (temp2 > 128))
{
airtemp =  ((temp2*32)+(temp3*1/8));
}



else if ((temp1 == 6) && (temp2 < 129))
{
airtemp =  (8192 + (temp2*64)+(temp3*1/2));
}
else if ((temp1 == 6) && (temp2 > 128))
{
airtemp =  ((temp2*128)+(temp3*1/2));
}

else
{
  airtemp = 0;
 // console.log ("wrong");   
}
return (airtemp);
}


      return {
        afstatus: Boolean(buffer.readUInt8(1)), //Status. 1 on. 0 off.
        afno: buffer.readUInt8(0), //AF No.
        setupmode: buffer.readUInt8(3),//0 智能 1 手动 2 内循环 3 恒温 
        setupspeed: buffer.readUInt8(2),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
       
        temperature: {
           insidetemp: (decodetemp(buffer.readUInt32BE(6).toString(16))),//室内温度
           pm25: (decodetemp(buffer.readUInt32BE(18).toString(16))),//pm25
           tvoc: (decodetemp(buffer.readUInt32BE(22).toString(16))),//tvoc
          co2: (decodetemp(buffer.readUInt32BE(26).toString(16))),//co2
           humidity: (decodetemp(buffer.readUInt32BE(14).toString(16)))//湿度
         },
     





 };
    },

    encode: function(data) {
      var buffer = new Buffer(4);
      var temperature = data.temperature;

      buffer.writeUInt8(data.afstatus, 1);
      buffer.writeUInt8(data.afno, 0);
      buffer.writeUInt8(data.setupmode, 3);
      buffer.writeUInt8(data.setupspeed, 2);

      return buffer;
    }
  },






  // 10.1.1 Read AC Status

  // 0x1938

   0x1938: {

	parse: function(buffer) {

      return { acno: buffer.readUInt8(0) };
    },


    encode: function(data) {
      return new Buffer([data.acno]);
    },

    response: 0x1939

  },



  // 10.1.2 Response Read AC Status

  // 0x1939

  0x1939: {

    parse: function(buffer) {

       return {
        acstatus: Boolean(buffer.readUInt8(8)), //Status. 1 on. 0 off.
        acno: buffer.readUInt8(0), //AC No.
        setupmode: buffer.readUInt8(9),//0 cooling. 1 heating. 2 fan. 3 auto. 4 dry
        setupspeed: buffer.readUInt8(10),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
        
        temperature: {
          type: buffer.readUInt8(1),//Type. 0 celsius. 1 farenheit
          now: buffer.readUInt8(2),//DLP Temprature
          cooling: buffer.readUInt8(3),//Cooling Temprature
          heating: buffer.readUInt8(4),//Heating Temprature
          auto: buffer.readUInt8(5),//Auto Temprature
          dry: buffer.readUInt8(6)//Dry Temprature
        },
		
        modeandfan: buffer.readUInt8(7),//Mode and Fan always 48
				currentmode: buffer.readUInt8(11),//Current Mode Temprature
		    sweep: buffer.readUInt8(12)//Sweep?
      };
    },



    encode: function(data) {
      var buffer = new Buffer(13);
      var temperature = data.temperature;

      buffer.writeUInt8(data.acstatus, 8);
      buffer.writeUInt8(data.acno, 0);
      buffer.writeUInt8(data.setupmode, 9);
      buffer.writeUInt8(data.setupspeed, 10);
      buffer.writeUInt8(temperature.type, 1);
      buffer.writeUInt8(temperature.now, 2);      
      buffer.writeUInt8(temperature.cooling, 3);
      buffer.writeUInt8(temperature.heating, 4);
      buffer.writeUInt8(temperature.auto, 5);
      buffer.writeUInt8(temperature.dry, 6);
      buffer.writeUInt8(data.modeandfan, 7);
	  buffer.writeUInt8(data.currentmode, 11);
	  buffer.writeUInt8(data.sweep, 12);

      return buffer;
    }
  },









  // 10.1.3 Control AC Status. Type New.
  //Documetation is wrong.
  0x193A: {  
    parse: function(buffer) {
      return {
        acstatus: Boolean(buffer.readUInt8(8)), //Status. 1 on. 0 off.
        acno: buffer.readUInt8(0), //AC No.
        setupmode: buffer.readUInt8(9),//0 cooling. 1 heating. 2 fan. 3 auto. 4 dry
        setupspeed: buffer.readUInt8(10),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
        
        temperature: {
          type: buffer.readUInt8(1),//Type. 0 celsius. 1 farenheit
          now: buffer.readUInt8(2),//DLP Temprature
          cooling: buffer.readUInt8(3),//Cooling Temprature
          heating: buffer.readUInt8(4),//Heating Temprature
          auto: buffer.readUInt8(5),//Auto Temprature
          dry: buffer.readUInt8(6)//Dry Temprature
        },
		
        modeandfan: buffer.readUInt8(7),//Mode and Fan always 48
				currentmode: buffer.readUInt8(11),//Current Mode Temprature
		    sweep: buffer.readUInt8(12)//Sweep?
      };
    },

    encode: function(data) {
      var buffer = new Buffer(13);
      var temperature = data.temperature;

      buffer.writeUInt8(data.acstatus, 8);
      buffer.writeUInt8(data.acno, 0);
      buffer.writeUInt8(data.setupmode, 9);
      buffer.writeUInt8(data.setupspeed, 10);
      buffer.writeUInt8(temperature.type, 1);
      buffer.writeUInt8(temperature.now, 2);      
      buffer.writeUInt8(temperature.cooling, 3);
      buffer.writeUInt8(temperature.heating, 4);
      buffer.writeUInt8(temperature.auto, 5);
      buffer.writeUInt8(temperature.dry, 6);
      buffer.writeUInt8(data.modeandfan, 7);
	  buffer.writeUInt8(data.currentmode, 11);
	  buffer.writeUInt8(data.sweep, 12);

      return buffer;
    }
  },

  // 10.1.4 Response Control AC Status
  0x193B: {  
    parse: function(buffer) {
      return {
        acstatus: Boolean(buffer.readUInt8(8)), //Status. 1 on. 0 off.
        acno: buffer.readUInt8(0), //AC No.
        setupmode: buffer.readUInt8(9),//0 cooling. 1 heating. 2 fan. 3 auto. 4 dry
        setupspeed: buffer.readUInt8(10),//Fan Speed. 0 Auto. 1 High. 2 Medium. 3 Low.
        
        temperature: {
          type: buffer.readUInt8(1),//Type. 0 celsius. 1 farenheit
          now: buffer.readUInt8(2),//DLP Temprature
          cooling: buffer.readUInt8(3),//Cooling Temprature
          heating: buffer.readUInt8(4),//Heating Temprature
          auto: buffer.readUInt8(5),//Auto Temprature
          dry: buffer.readUInt8(6)//Dry Temprature
        },
		
        modeandfan: buffer.readUInt8(7),//Mode and Fan always 48
		currentmode: buffer.readUInt8(11),//Current Mode Temprature
		sweep: buffer.readUInt8(12)//Sweep?
      };
    },

    encode: function(data) {
      var buffer = new Buffer(13);
      var temperature = data.temperature;

      buffer.writeUInt8(data.acstatus, 8);
      buffer.writeUInt8(data.acno, 0);
      buffer.writeUInt8(data.setupmode, 9);
      buffer.writeUInt8(data.setupspeed, 10);
      buffer.writeUInt8(temperature.type, 1);
      buffer.writeUInt8(temperature.now, 2);      
      buffer.writeUInt8(temperature.cooling, 3);
      buffer.writeUInt8(temperature.heating, 4);
      buffer.writeUInt8(temperature.auto, 5);
      buffer.writeUInt8(temperature.dry, 6);
      buffer.writeUInt8(data.modeandfan, 7);
      buffer.writeUInt8(data.currentmode, 11);
      buffer.writeUInt8(data.sweep, 12);

      return buffer;
    }
  },

  /* 11.1 Floor Heating Control from DLP */

  // 11.1.1 Read Floor Heating Status
   0x1944: {
	parse: function(buffer) {
      return null;
    },

     encode: function(data) {
      return new Buffer([]);
    },
    response: 0x1945
  },

  // 11.1.2 Response Read Floor Heating Status
  0x1945: {
    parse: function(buffer) {
      return {
        status: Boolean(buffer.readUInt8(2)),
        mode: buffer.readUInt8(3),

        temperature: {
          type: buffer.readUInt8(0),
          current: buffer.readInt8(1),
          normal: buffer.readUInt8(4),
          day: buffer.readUInt8(5),
          night: buffer.readUInt8(6),
          away: buffer.readUInt8(7)
        },

        timer: buffer.readUInt8(8)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(9);
      var temperature = data.temperature;

      buffer.writeUInt8(temperature.type, 0);
      buffer.writeInt8(temperature.current, 1);
      buffer.writeUInt8(data.status ? 1 : 0, 2);
      buffer.writeUInt8(data.mode, 3);
      buffer.writeUInt8(temperature.normal, 4);
      buffer.writeUInt8(temperature.day, 5);
      buffer.writeUInt8(temperature.night, 6);
      buffer.writeUInt8(temperature.away, 7);
      buffer.writeUInt8(data.timer, 8);

      return buffer;
    }
  },

  // 11.1.3 Control Floor Heating Status
  0x1946: {
    parse: function(buffer) {
      return {
        status: Boolean(buffer.readUInt8(1)),
        mode: buffer.readUInt8(2),

        temperature: {
          type: buffer.readUInt8(0),
          normal: buffer.readUInt8(3),
          day: buffer.readUInt8(4),
          night: buffer.readUInt8(5),
          away: buffer.readUInt8(6)
        }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);
      var temperature = data.temperature;

      buffer.writeInt8(temperature.type, 0);
      buffer.writeUInt8(data.status ? 1 : 0, 1);
      buffer.writeUInt8(data.mode, 2);
      buffer.writeUInt8(temperature.normal, 3);
      buffer.writeUInt8(temperature.day, 4);
      buffer.writeUInt8(temperature.night, 5);
      buffer.writeUInt8(temperature.away, 6);

      return buffer;
    },

    response: 0x1947
  },

  // 11.1.4 Response Control Floor Heating Status
  0x1947: {
    parse: function(buffer) {
      return {
        success: status.parse(buffer, 0),
        status: Boolean(buffer.readUInt8(2)),
        mode: buffer.readUInt8(3),

        temperature: {
          type: buffer.readUInt8(1),
          normal: buffer.readUInt8(4),
          day: buffer.readUInt8(5),
          night: buffer.readUInt8(6),
          away: buffer.readUInt8(7)
        }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(8);
      var temperature = data.temperature;

      status.encode(buffer, data.success, 0);
      buffer.writeInt8(temperature.type, 1);
      buffer.writeUInt8(data.status ? 1 : 0, 2);
      buffer.writeUInt8(data.mode, 3);
      buffer.writeUInt8(temperature.normal, 4);
      buffer.writeUInt8(temperature.day, 5);
      buffer.writeUInt8(temperature.night, 6);
      buffer.writeUInt8(temperature.away, 7);

      return buffer;
    }
  },

  /* 11.2 Floor Heating Control from Floor Heating Module */

  // 11.2.1 Read Floor Heating Status
  0x1C5E: {
    parse: function(buffer) {
      return { channel: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.channel]);
    },

    response: 0x1C5F
  },

  // 11.2.2 Response Read Floor Heating Status
  //Documentation is wrong missing current temperature in index 9
  0x1C5F: {
    parse: function(buffer) {
      var work = buffer.readUInt8(1);
      var watering = buffer.readUInt8(12);

      return {
        channel: buffer.readUInt8(0),
        work: { type: work >> 4, status: Boolean(work & 0x0F) },

        temperature: {
          type: buffer.readUInt8(2),
          normal: buffer.readUInt8(4),
          day: buffer.readUInt8(5),
          night: buffer.readUInt8(6),
          away: buffer.readUInt8(7),
          current: buffer.readUInt8(9)
        },

        mode: buffer.readUInt8(3),
        timer: buffer.readUInt8(8),
        valve: Boolean(buffer.readUInt8(10)),
        PWD: buffer.readUInt8(11),

        watering: {
          type: watering >> 4,
          status: Boolean(watering & 0x0F),
          time: buffer.readUInt8(13)
        }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(14);

      var work = data.work;
      var watering = data.watering;
      var temperature = data.temperature;

      buffer.writeUInt8(data.channel, 0);
      buffer.writeUInt8(work.type << 4 | (work.status ? 1 : 0), 1);
      buffer.writeUInt8(temperature.type, 2);
      buffer.writeUInt8(data.mode, 3);
      buffer.writeUInt8(temperature.normal, 4);
      buffer.writeUInt8(temperature.day, 5);
      buffer.writeUInt8(temperature.night, 6);
      buffer.writeUInt8(temperature.away, 7);
      buffer.writeUInt8(temperature.current, 9);
      buffer.writeUInt8(data.timer, 8);
      buffer.writeUInt8(data.valve ? 1 : 0, 10);
      buffer.writeUInt8(data.PWD, 11);
      buffer.writeUInt8(watering.type << 4 | (watering.status ? 1 : 0), 12);
      buffer.writeUInt8(watering.time, 13);

      return buffer;
    }
  },

  // 11.2.3 Control Floor Heating Status
  0x1C5C: {
    parse: function(buffer) {
      var work = buffer.readUInt8(1);

      return {
        channel: buffer.readUInt8(0),
        work: { type: work >> 4, status: Boolean(work & 0x0F) },

        temperature: {
          type: buffer.readUInt8(2),
          normal: buffer.readUInt8(4),
          day: buffer.readUInt8(5),
          night: buffer.readUInt8(6),
          away: buffer.readUInt8(7)
        },

        mode: buffer.readUInt8(3),
        valve: Boolean(buffer.readUInt8(8)),

        watering: { time: buffer.readUInt8(9) }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(10);

      var work = data.work;
      var temperature = data.temperature;

      buffer.writeUInt8(data.channel, 0);
      buffer.writeUInt8(work.type << 4 | (work.status ? 1 : 0), 1);
      buffer.writeUInt8(temperature.type, 2);
      buffer.writeUInt8(data.mode, 3);
      buffer.writeUInt8(temperature.normal, 4);
      buffer.writeUInt8(temperature.day, 5);
      buffer.writeUInt8(temperature.night, 6);
      buffer.writeUInt8(temperature.away, 7);
      buffer.writeUInt8(data.valve ? 1 : 0, 8);
      buffer.writeUInt8(data.watering.time, 9);

      return buffer;
    },

    response: 0x1C5D
  },

  // 11.2.4 Response Control Floor Heating Status
  // Documentation is wrong responce is identical to 0x1C5F
  0x1C5D: {
    parse: function(buffer) {
      var work = buffer.readUInt8(1);
      var watering = buffer.readUInt8(12);

      return {
        channel: buffer.readUInt8(0),
        work: { type: work >> 4, status: Boolean(work & 0x0F) },

        temperature: {
          type: buffer.readUInt8(2),
          normal: buffer.readUInt8(4),
          day: buffer.readUInt8(5),
          night: buffer.readUInt8(6),
          away: buffer.readUInt8(7),
          current: buffer.readUInt8(9)
        },

        mode: buffer.readUInt8(3),
        timer: buffer.readUInt8(8),
        valve: Boolean(buffer.readUInt8(10)),
        PWD: buffer.readUInt8(11),

        watering: {
          type: watering >> 4,
          status: Boolean(watering & 0x0F),
          time: buffer.readUInt8(13)
        }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(14);

      var work = data.work;
      var watering = data.watering;
      var temperature = data.temperature;

      buffer.writeUInt8(data.channel, 0);
      buffer.writeUInt8(work.type << 4 | (work.status ? 1 : 0), 1);
      buffer.writeUInt8(temperature.type, 2);
      buffer.writeUInt8(data.mode, 3);
      buffer.writeUInt8(temperature.normal, 4);
      buffer.writeUInt8(temperature.day, 5);
      buffer.writeUInt8(temperature.night, 6);
      buffer.writeUInt8(temperature.away, 7);
      buffer.writeUInt8(temperature.current, 9);
      buffer.writeUInt8(data.timer, 8);
      buffer.writeUInt8(data.valve ? 1 : 0, 10);
      buffer.writeUInt8(data.PWD, 11);
      buffer.writeUInt8(watering.type << 4 | (watering.status ? 1 : 0), 12);
      buffer.writeUInt8(watering.time, 13);

      return buffer;
    }
  },

  /* 11.3 Floor Heating Settings (DLP Works as Master) */

  // 11.3.1 Read Floor Heating Settings
  // 0x1940

  // 11.3.2 Response Read Floor Heating Settings
  // 0x1941

  // 11.3.3 Modify Floor Heating Settings
  // 0x1942

  // 11.3.4 Response Modify Floor Heating Settings
  // 0x1943

  /* 11.4 Floor Heating Settings (Floor Heating module Works as Master) */

  // 11.4.1 Read Floor Heating Day Night Time Setting
  // 0x1D1E

  // 11.4.2 Response Read Floor Heating Day Night Time Setting
  // 0x1D1F

  // 11.4.3 Modify Floor Heating Day Night Time Setting
  // 0x1D1D

  // 11.4.4 Response Modify Floor Heating Day Night Time Setting
  // 0x1D1F

  /* 12.1 Read Sensors Status (8in1 DeviceType315) */

  // 12.1.1 Read Sensors Status
  0xDB00: {
    parse: function(buffer) {
      return { logic: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.logic]);
    },

    response: 0xDB01
  },

  // 12.1.2 Response Read Sensors Status
  0xDB01: {
    parse: function(buffer) {
      var data = {
        delay: word.parse(buffer, 6),
        movement: Boolean(buffer.readUInt8(3)),
        dryContacts: new Array(2)
      };

      var contacts = data.dryContacts;

      for (var i = 0; i < 2; i++) contacts[i] = {
        number: i + 1,
        status: Boolean(buffer.readUInt8(i))
      };

      return data;
    },

    encode: function(data) {
      var buffer = new Buffer(8);
      var contacts = data.dryContacts || [];

      for (var i = 0; i < 2; i++)
        buffer.writeUInt8(contacts[i].status, i);

      buffer.writeUInt8(0, 2);
      buffer.writeUInt8(data.movement, 3);
      buffer.writeUInt16LE(0, 4);
      word.encode(buffer, data.delay, 6);

      return buffer;
    }
  },

  /* 12.2 Read Sensors Status (8in1 DeviceType314) */

  // 12.2.1 Read Sensors Status
 0x1645: {
	parse: function(buffer) {
      return null;
    },

     encode: function(data) {
      return new Buffer([]);
    },
    response: 0x1646
  },

  // 12.2.2 Response Read Sensors Status
  0x1646: {
    parse: function(buffer) {
      var data = {
        success: status.parse(buffer, 0),
        temperature: buffer.readUInt8(1) - 20,
        brightness: word.parse(buffer, 2),
        movement: Boolean(buffer.readUInt8(4)),
        dryContacts: []
      };

      var offset = 5;
      var length = buffer.length;
      var contacts = data.dryContacts;

      if (length >= 8)
        data.sonic = Boolean(buffer.readUInt8(offset++));

      while (offset < 9 && offset < length) contacts[contacts.length] = {
        number: contacts.length + 1,
        status: Boolean(buffer.readUInt8(offset++))
      };

      return data;
    },

    encode: function(data) {
      var contacts = data.dryContacts || [];
      var hasSonic = data.hasOwnProperty('sonic');

      var buffer = new Buffer(hasSonic ? 8 : 7);

      status.encode(buffer, data.success, 0);
      buffer.writeUInt8(data.temperature + 20, 1);
      word.encode(buffer, data.brightness, 2);
      buffer.writeUInt8(data.movement, 4);

      var offset = 5;

      if (hasSonic) buffer.writeUInt8(data.sonic, offset++);

      for (var i = 0; i < contacts.length; i++)
        buffer.writeUInt8(contacts[i].status ? 1 : 0, i + offset);

      return buffer;
    }
  },

  /* 12.3 Read Sensors Status (12in1) */

  // Same codes as for 12.2

  // 12.3.3 Broadcast Sensors Status Automatically
  0x1647: {
    parse: function(buffer) {
      var data = {
        temperature: buffer.readUInt8(0) - 20,
        brightness: word.parse(buffer, 1),
        movement: Boolean(buffer.readUInt8(3)),
        sonic: Boolean(buffer.readUInt8(4)),
        dryContacts: []
      };

      var offset = 5;
      var length = buffer.length;
      var contacts = data.dryContacts;

      while (offset < 7 && offset < length) contacts[contacts.length] = {
        number: contacts.length + 1,
        status: Boolean(buffer.readUInt8(offset++))
      };

      return data;
    },

    encode: function(data) {
      var buffer = new Buffer(7);
      var contacts = data.dryContacts || [];

      buffer.writeUInt8(data.temperature + 20, 0);
      word.encode(buffer, data.brightness, 1);
      buffer.writeUInt8(data.movement, 3);
      buffer.writeUInt8(data.sonic, 4);

      for (var i = 0; i < contacts.length; i++)
        buffer.writeUInt8(contacts[i].status ? 1 : 0, i + 5);

      return buffer;
    }
  },

  /* 12.4 Read Sensors Status (SensorsInOne) */

  // 12.4.1 Read Sensors Status
  0x1604: {
    parse: function(buffer) {
      return null;
    },

    encode: function(data) {
      return new Buffer([]);
    },

    response: 0x1605
  },

  // 12.4.2 Response Read Sensors Status
  0x1605: {
    parse: function(buffer) {
      var data = {
        success: status.parse(buffer, 0),
        temperature: buffer.readUInt8(1) - 20,
        brightness: word.parse(buffer, 2),
        humidity: buffer.readUInt8(4),
        air: buffer.readUInt8(5),
        gas: buffer.readUInt8(6),
        movement: Boolean(buffer.readUInt8(7)),
        dryContacts: []
      };

      var offset = 8;
      var length = buffer.length;
      var contacts = data.dryContacts;

      while (offset < 10 && offset < length) contacts[contacts.length] = {
        number: contacts.length + 1,
        status: Boolean(buffer.readUInt8(offset++))
      };

      return data;
    },

    encode: function(data) {
      var buffer = new Buffer(10);
      var contacts = data.dryContacts || [];

      status.encode(buffer, data.success, 0);
      buffer.writeUInt8(data.temperature + 20, 1);
      word.encode(buffer, data.brightness, 2);
      buffer.writeUInt8(data.humidity, 4);
      buffer.writeUInt8(data.air, 5);
      buffer.writeUInt8(data.gas, 6);
      buffer.writeUInt8(data.movement, 7);

      for (var i = 0; i < contacts.length; i++)
        buffer.writeUInt8(contacts[i].status ? 1 : 0, i + 8);

      return buffer;
    }
  },

  // 12.4.3 Broadcast Sensors Status
  // FIXME: same as 0x1605
  0x1630: {
    parse: function(buffer) {
      var data = {
        success: status.parse(buffer, 0),
        temperature: buffer.readUInt8(1) - 20,
        brightness: word.parse(buffer, 2),
        air: buffer.readUInt8(4),
        gas: buffer.readUInt8(5),
        movement: Boolean(buffer.readUInt8(6)),
        dryContacts: []
      };

      var offset = 7;
      var length = buffer.length;
      var contacts = data.dryContacts;

      while (offset < 9 && offset < length) contacts[contacts.length] = {
        number: contacts.length + 1,
        status: Boolean(buffer.readUInt8(offset++))
      };

      return data;
    },

    encode: function(data) {
      var buffer = new Buffer(9);
      var contacts = data.dryContacts || [];

      status.encode(buffer, data.success, 0);
      buffer.writeUInt8(data.temperature + 20, 1);
      word.encode(buffer, data.brightness, 2);
      buffer.writeUInt8(data.air, 4);
      buffer.writeUInt8(data.gas, 5);
      buffer.writeUInt8(data.movement, 6);

      for (var i = 0; i < contacts.length; i++)
        buffer.writeUInt8(contacts[i].status ? 1 : 0, i + 7);

      return buffer;
    }
  },

  /* 13.1 Read Temperature */

  // 13.1.1 Read Temperature
  0xE3E7: {
    parse: function(buffer) {
      return { channel: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.channel]);
    },

    response: 0xE3E8
  },

  // 13.1.2 Response Read Temperature
  0xE3E8: {
    parse: function(buffer) {
      var temperature = buffer.readUInt8(1);
      var sign = (temperature >> 0x80 & 1) ? -1 : 1;

      return {
        channel: buffer.readUInt8(0),
        temperature: sign * (temperature & ~0x80)
      };
    },

    encode: function(data) {
      var temperature = data.temperature;
      var sign = data.temperature < 0 ? 0x80 : 0;

      if (temperature < 0) temperature = -temperature;

      return new Buffer([data.channel, temperature | sign]);
    }
  },

  // 13.1.3 Broadcast Temperature
  // FIXME: documentation is wrong
  0xE3E5: {
    parse: function(buffer) {
      return {
        channel: buffer.readUInt8(0),
        temperature: buffer.readFloatLE(buffer.length - 4)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(6);

      buffer.writeUInt8(data.channel, 0);
      buffer.writeUInt8(data.temperature, 1);
      buffer.writeFloatLE(data.temperature, 2);

      return buffer;
    }
  },

  /* 13.2 Read Temperature New */

  // 13.2.1 Read Temperature New
  0x1948: {
    parse: function(buffer) {
      return { channel: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.channel]);
    },

    response: 0x1949
  },

  // 13.2.2 Response Temperature
  0x1949: {
    parse: function(buffer) {
      return {
        channel: buffer.readUInt8(0),
        temperature: buffer.readFloatLE(1)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(5);

      buffer.writeUInt8(data.channel, 0);
      buffer.writeFloatLE(data.temperature, 1);

      return buffer;
    }
  },

  /* 14. Security Module */

  // 14.1.1 Read Security Module
  // 0x011E

  // 14.1.2 Response Read Security Module
  // 0x011F

  // 14.1.3 Arm Security Module
  // 0x0104

  // 14.1.4 Response Arm Security Module
  // 0x0105

  // 14.1.5 Alarm Security Module
  // 0x010C

  // 14.1.6 Response Alarm Security Module
  // 0x010D

  /* 15. Music Control */

  // 15.1.1 Music Control
  // 0x0218

  // 15.1.2 Response Music Control
  // 0x0219

  // 15.1.3 Read Read Music Control Status
  // 0x021A

  // 15.1.4 Response Music Control
  // 0x021B

  /* 16. Dry Contact */

  // 16.1.1 Auto broadcast Dry Contact Status
  // 0x15D0

  // 16.1.2 Response Auto broadcast Dry Contact Status
  // 0x15D1

  // 16.1.3 Read Dry Contact Status
  // 0x15CE

  // 16.1.4 Response Read Dry Contact Status
  // 0x15CF

  /* 17. DLP Music Play Control Command */

  // 17.1.1 Read Z-audio Current Status
  // 0x192E

  // 17.1.2 Response Read Z-audio Current Status
  // 0x192F

  // 17.1.7 Change Source
  // 0x192E

  /* 18. Z-audio Command */

  // 18.1.1 Read Play Lists
  // 0x1364

  // 18.1.2 Response Read Play Lists
  // 0x1365

  /* 19. Power meter Command */

  // 19.1.1 Read Voltage
  // 0xD902

  // 19.1.2 Response Read Voltage
  // 0xD903

  // 19.2.1 Read Current
  // 0xD908

  // 19.2.2 Response Read Current
  // 0xD909

  // 19.3.1 Read Power
  // 0xD90A

  // 19.3.2 Response Read Power
  // 0xD90B

  // 19.4.1 Read Power Factor
  // 0xD904

  // 19.4.2 Response Read Power Factor
  // 0xD905

  // 19.5.1 Read Electricity
  // 0xD91A

  // 19.5.2 Response Read Electricity
  // 0xD91B

  /* 20. Universal Control */

  // 20.1.1 Read UV Control Setup
  // 0x16A4

  // 20.1.2 Response Read UV Control Setup
  // 0x16A5

  // 20.2.1 Universal control
  // 0x16A6

  // 20.2.2 Response Universal Cotrol
  // 0x16A7

  /* 21. Analog Value */

  // 21.1.1 Read Analog Value
  // 0xE440

  // 21.1.2 Response Read Analog Value
  // 0xE441
  /* 99. Undocumented Operation Codes */

  // 99.1.1 Read Panel Brightness
  0xE010: {
    response: 0xE011
  },

  // 99.1.2 Responce Read Panel Brightness
  0xE011: {
    parse: function(buffer) {
      return {
        backlight: buffer.readUInt8(0),
        statusLights: buffer.readUInt8(1),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(2);

      buffer.writeUInt8(data.backlight, 0);
      buffer.writeUInt8(data.statusLights, 1);

      return buffer;
    }
  },
  // 99.1.3 Panel brightness/lock Control
  0xE012: {
    parse: function(buffer) {
      return {
        backlight: buffer.readUInt8(0),
        statusLights: buffer.readUInt8(1),
        autoLock: buffer.readUInt8(2)
      };
    },

    encode: function(data) {
      var buffer = new Buffer(3);

      buffer.writeUInt8(data.backlight, 0);
      buffer.writeUInt8(data.statusLights, 1);
      buffer.writeUInt8(data.autoLock, 2);

      return buffer;
    }
  },

  // 99.1.4 Panel brightness/lock response
  0xE013: {
    parse: function(buffer) {
      return { success: status.parse(buffer, 0) };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },

  // 99.1.5 Read Panel Other
  0xE0E0: {
    response: 0xE0E1
  },

  // 99.1.6 Responce Read Panel Other
  0xE0E1: {
    parse: function(buffer) {
      return { 
        success: status.parse(buffer, 0),
        reciveir: buffer.readUInt8(1),
        mindimmingvalue: buffer.readUInt8(2),
        showtemperature: buffer.readUInt8(3),
        showdateandtime: buffer.readUInt8(5),
        longpresstime: buffer.readUInt8(4),
        doubleclicktime: buffer.readUInt8(6),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);

      status.encode(buffer, data.success, 0);
      buffer.writeInt8(data.reciveir, 1);
      buffer.writeUInt8(data.mindimmingvalue, 2);
      buffer.writeUInt8(data.showtemperature, 3);
      buffer.writeUInt8(data.longpresstime, 4);
      buffer.writeUInt8(data.showdateandtime, 5);
      buffer.writeUInt8(data.doubleclicktime, 6);

      return buffer;
    }
  },

  // 99.1.7 Panel Other Control
  0xE0E2: {
    parse: function(buffer) {
      return { 
        reciveir: buffer.readUInt8(0),
        mindimmingvalue: buffer.readUInt8(1),
        showtemperature: buffer.readUInt8(2),
        showdateandtime: buffer.readUInt8(4),
        longpresstime: buffer.readUInt8(3),
        doubleclicktime: buffer.readUInt8(5),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(9);

      buffer.writeInt8(data.reciveir, 0);
      buffer.writeUInt8(data.mindimmingvalue, 1);
      buffer.writeUInt8(data.showtemperature, 2);
      buffer.writeUInt8(data.longpresstime, 3);
      buffer.writeUInt8(data.showdateandtime, 4);
      buffer.writeUInt8(data.doubleclicktime, 5);

      return buffer;
    }
  },

  // 99.1.8 Responce Panel Other Control
  0xE0E3: {
    parse: function(buffer) {
      return { 
        success: status.parse(buffer, 0) 
      };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },
  // 99.1.9 Read Panel Buttons Page
  0xE12C: {
    response: 0xE12D
  },

  // 99.1.10 Responce Read Panel Buttons Page
  0xE12D: {
    parse: function(buffer) {
      return { 
        buttonpage1: buffer.readUInt8(0),
        buttonpage2: buffer.readUInt8(1),
        buttonpage3: buffer.readUInt8(2),
        buttonpage4: buffer.readUInt8(3),
        acpage: buffer.readUInt8(4),
        musicpage: buffer.readUInt8(5),
        floorheatingpage: buffer.readUInt8(6),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);

      buffer.writeUInt8(data.buttonpage1, 0);
      buffer.writeUInt8(data.buttonpage2, 1);
      buffer.writeUInt8(data.buttonpage3, 2);
      buffer.writeUInt8(data.buttonpage4, 3);
      buffer.writeUInt8(data.acpage, 4);
      buffer.writeUInt8(data.musicpage, 5);
      buffer.writeUInt8(data.floorheatingpage, 6);

      return buffer;
    }
  },
  // 99.1.10 Panel Buttons Page Control
  0xE12E: {
    parse: function(buffer) {
      return { 
        buttonpage1: buffer.readUInt8(0),
        buttonpage2: buffer.readUInt8(1),
        buttonpage3: buffer.readUInt8(2),
        buttonpage4: buffer.readUInt8(3),
        acpage: buffer.readUInt8(4),
        musicpage: buffer.readUInt8(5),
        floorheatingpage: buffer.readUInt8(6),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);

      buffer.writeUInt8(data.buttonpage1, 0);
      buffer.writeUInt8(data.buttonpage2, 1);
      buffer.writeUInt8(data.buttonpage3, 2);
      buffer.writeUInt8(data.buttonpage4, 3);
      buffer.writeUInt8(data.acpage, 4);
      buffer.writeUInt8(data.musicpage, 5);
      buffer.writeUInt8(data.floorheatingpage, 6);

      return buffer;
    }
  },

  // 99.1.11 Responce Panel Buttons Page Control  
  0xE12F: {
    parse: function(buffer) {
      return { 
        success: status.parse(buffer, 0) 
      };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },
  // 99.1.12 Read Panel Eco Mode
  0xE138: {
    response: 0xE139
  },

  // 99.1.13 Responce Read Panel Eco Mode
  0xE139: {
    parse: function(buffer) {
      return { 
        ecoDelaySec: buffer.readUInt8(0),
        standbyBacklight: buffer.readUInt8(1),
        standbyStatusLights: buffer.readUInt8(6),
        returnStandbyPage: buffer.readUInt8(2),
        returnStandbyPageDelay: buffer.readUInt8(3),
        clickSound: buffer.readUInt8(4),
        triggerButtonWhenLcdWakeUp: buffer.readUInt8(5),
        proximitySensorTriggerKey: buffer.readUInt8(7),
        proximitySensorEnable: buffer.readUInt8(8),
        proximitySensorSensitivity: buffer.readUInt8(9),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(10);

      buffer.writeUInt8(data.ecoDelaySec, 0);
      buffer.writeUInt8(data.standbyBacklight, 1);
      buffer.writeUInt8(data.returnStandbyPage, 2);
      buffer.writeUInt8(data.returnStandbyPageDelay, 3);
      buffer.writeUInt8(data.clickSound, 4);
      buffer.writeUInt8(data.triggerButtonWhenLcdWakeUp, 5);
      buffer.writeUInt8(data.standbyStatusLights, 6);
      buffer.writeUInt8(data.proximitySensorTriggerKey, 7);
      buffer.writeUInt8(data.proximitySensorEnable, 8);
      buffer.writeUInt8(data.proximitySensorSensitivity, 9);

      return buffer;
    }
  },  

  // 99.1.14 Panel Eco Mode Control
  0xE13A: {
    parse: function(buffer) {
      return { 
        ecoDelaySec: buffer.readUInt8(0),
        standbyBacklight: buffer.readUInt8(1),
        standbyStatusLights: buffer.readUInt8(6),
        returnStandbyPage: buffer.readUInt8(2),
        returnStandbyPageDelay: buffer.readUInt8(3),
        clickSound: buffer.readUInt8(4),
        triggerButtonWhenLcdWakeUp: buffer.readUInt8(5),
        proximitySensorTriggerKey: buffer.readUInt8(7),
        proximitySensorEnable: buffer.readUInt8(8),
        proximitySensorSensitivity: buffer.readUInt8(9),
      };
    },

    encode: function(data) {
      var buffer = new Buffer(10);

      buffer.writeUInt8(data.ecoDelaySec, 0);
      buffer.writeUInt8(data.standbyBacklight, 1);
      buffer.writeUInt8(data.returnStandbyPage, 2);
      buffer.writeUInt8(data.returnStandbyPageDelay, 3);
      buffer.writeUInt8(data.clickSound, 4);
      buffer.writeUInt8(data.triggerButtonWhenLcdWakeUp, 5);
      buffer.writeUInt8(data.standbyStatusLights, 6);
      buffer.writeUInt8(data.proximitySensorTriggerKey, 7);
      buffer.writeUInt8(data.proximitySensorEnable, 8);
      buffer.writeUInt8(data.proximitySensorSensitivity, 9);

      return buffer;
    }
  },  

  // 99.1.15 Responce Panel Eco Mode Control
  0xE13B: {
    parse: function(buffer) {
      return { 
        success: status.parse(buffer, 0) 
      };
    },

    encode: function(data) {
      var buffer = new Buffer(1);

      status.encode(buffer, data.success, 0);

      return buffer;
    }
  },

  // 99.1.16 Panel button color
  0xE14E: {
    parse: function(buffer) {
      return {
        button: buffer.readUInt8(0),
        color: {
          on: [buffer.readUInt8(1), buffer.readUInt8(2), buffer.readUInt8(3)],
          off: [buffer.readUInt8(4), buffer.readUInt8(5), buffer.readUInt8(6)]
        }
      };
    },

    encode: function(data) {
      var buffer = new Buffer(7);

      buffer.writeUInt8(data.button, 0);
      buffer.writeUInt8(data.color.on[0], 1);
      buffer.writeUInt8(data.color.on[1], 2);
      buffer.writeUInt8(data.color.on[2], 3);
      buffer.writeUInt8(data.color.off[0], 4);
      buffer.writeUInt8(data.color.off[1], 5);
      buffer.writeUInt8(data.color.off[2], 6);

      return buffer;
    }
  },

  // 99.1.17 Panel button color response
  0xE14F: {
    parse: function(buffer) {
      return { button: buffer.readUInt8(0) };
    },

    encode: function(data) {
      return new Buffer([data.button]);
    }
  }
};
